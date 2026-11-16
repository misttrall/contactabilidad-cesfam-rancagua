import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modulosPermitidos, type Rol } from '@bh/shared';

// --- Mocks: sin red ni Keycloak ---------------------------------------------------------------
type Llamada = { metodo: string; ruta: string; body?: unknown };
const llamadas: Llamada[] = [];
let respuestas: Record<string, unknown> = {};

vi.mock('./api/cliente', () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      message: string,
      readonly detalle?: Record<string, unknown>,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    apiBlob: vi.fn(),
    apiFetch: vi.fn(async (ruta: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET';
      llamadas.push({ metodo, ruta, body: init?.body });
      // Las consultas GET con parámetros se resuelven por su ruta sin la query.
      const clave = `${metodo} ${ruta.split('?')[0]}`;
      const r = respuestas[clave];
      if (r === undefined) throw new Error(`Sin respuesta simulada para ${clave}`);
      return typeof r === 'function' ? (r as (ruta: string) => unknown)(ruta) : r;
    }),
  };
});
vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({ estado: 'autenticado', iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('./auth/auth', () => ({ userManager: {} }));

import { crearRouter } from './router';

const CENTRO = { id: 'c1', codigo: 'CSC', nombre: 'CESFAM Centro (DEMO)' };
const me = (rol: Rol, centro: typeof CENTRO | null) => ({
  id: 'u1',
  nombre: 'Usuaria Demo',
  rol,
  rolEtiqueta: rol,
  centro,
  modulos: [...modulosPermitidos([rol])],
});

const fila = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  hora: '09:00',
  paciente: `Paciente ${id}`,
  rut: '1.000.***-7',
  telefono: '+56 9 **** 0001',
  profesional: 'Dra. Demo Uno',
  prestacion: 'Control',
  tipo: 'cronico',
  estado: 'sin_enviar',
  subestado: null,
  adultoMayor: false,
  seleccionable: true,
  motivoNoSeleccionable: null,
  ...o,
});
const LISTADO = {
  opciones: {
    modo: 'simulador',
    puedeSimular: true,
    anticipacionHoras: 24,
    ventana: { desde: '09:00', hasta: '18:00' },
    horasEspera: 24,
    fechaSugerida: '2026-11-25',
  },
  resumen: { sin_enviar: 4, enviado: 1, confirmado: 1, sin_respuesta: 1, cancelado: 0 },
  filas: [
    fila('a'),
    fila('b', { hora: '09:30', adultoMayor: true }),
    fila('c', { hora: '10:00' }),
    fila('d', { estado: 'enviado', seleccionable: false, motivoNoSeleccionable: 'ya_enviada' }),
    fila('e', { telefono: null, seleccionable: false, motivoNoSeleccionable: 'sin_telefono' }),
    fila('f', {
      estado: 'sin_respuesta',
      subestado: 'recado',
      seleccionable: false,
      motivoNoSeleccionable: 'ya_enviada',
    }),
  ],
  truncado: false,
};
const PREVIA = {
  aEnviar: 2,
  sinTelefono: 1,
  baja: 0,
  yaEnviadasOEnOtroEstado: 0,
  mensaje:
    'Recordatorio de CESFAM Centro (DEMO): tiene una hora de control el miércoles 25 de noviembre a las 09:00. ¿Asistirá?',
  programadoPara: null,
  ventana: { desde: '09:00', hasta: '18:00' },
};

function montar() {
  const router = crearRouter({
    history: createMemoryHistory({ initialEntries: ['/confirmaciones'] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
const cuerpo = (metodo: string, ruta: string) => {
  const l = llamadas.find((x) => x.metodo === metodo && x.ruta.startsWith(ruta));
  return l?.body ? JSON.parse(String(l.body)) : undefined;
};

beforeEach(() => {
  window.scrollTo = vi.fn();
  // jsdom no implementa <dialog>
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  llamadas.length = 0;
  respuestas = {
    'GET /api/me': me('funcionaria', CENTRO),
    'GET /api/confirmaciones': LISTADO,
    'GET /api/liberaciones': [],
    'GET /api/centros': [CENTRO],
  };
});
afterEach(cleanup);

const casilla = (nombre: RegExp) =>
  screen.getByRole('checkbox', { name: nombre }) as HTMLInputElement;

describe('Confirmación masiva', () => {
  it('lista las citas del día: sin enviar seleccionables, y las demás deshabilitadas con su motivo', async () => {
    montar();
    expect(await screen.findByText('Paciente a')).toBeTruthy();
    expect(casilla(/Seleccionar a Paciente a/).disabled).toBe(false);
    expect(casilla(/Paciente d: Ya enviada/).disabled).toBe(true);
    expect(casilla(/Paciente e: Sin teléfono/).disabled).toBe(true);
    expect(screen.getByText('Adulto mayor')).toBeTruthy();
    expect(screen.getByText('Recado dejado')).toBeTruthy(); // subestado, en la familia ámbar de «sin respuesta»
    expect(screen.getByText(/nunca se cancela la hora/)).toBeTruthy();
    const q = llamadas.find((l) => l.ruta.startsWith('/api/confirmaciones'))!.ruta;
    expect(q).toContain('tipo=cronico');
    expect(q).toMatch(/fecha=\d{4}-\d{2}-\d{2}/);
  });

  it('el resumen muestra cada estado con texto y su cantidad', async () => {
    montar();
    await screen.findByText('Paciente a');
    const resumen = screen.getByLabelText('Resumen de las citas del día');
    expect(within(resumen).getByLabelText('Sin enviar: 4')).toBeTruthy();
    expect(within(resumen).getByLabelText('Confirmado: 1')).toBeTruthy();
  });

  it('selecciona, usa «seleccionar todas» (solo las disponibles) y limpia', async () => {
    montar();
    await screen.findByText('Paciente a');
    const enviar = screen.getByRole('button', { name: /Enviar confirmación/ }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);

    fireEvent.click(casilla(/Seleccionar a Paciente a/));
    expect(screen.getByText('1 seleccionada')).toBeTruthy();
    expect(casilla(/Seleccionar todas/).indeterminate).toBe(true);

    fireEvent.click(casilla(/Seleccionar todas/));
    expect(screen.getByText('3 seleccionadas')).toBeTruthy(); // a, b, c: las únicas disponibles
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(screen.getByText('Ninguna cita seleccionada')).toBeTruthy();
  });

  it('cambiar un filtro LIMPIA la selección (nunca se envía lo que ya no se ve)', async () => {
    montar();
    await screen.findByText('Paciente a');
    fireEvent.click(casilla(/Seleccionar todas/));
    expect(screen.getByText('3 seleccionadas')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'todos' } });
    expect(await screen.findByText('Ninguna cita seleccionada')).toBeTruthy();
    await waitFor(() => expect(llamadas.some((l) => l.ruta.includes('tipo=todos'))).toBe(true));
  });

  it('flujo de envío: vista previa en un diálogo, confirmar y seguimiento del avance', async () => {
    respuestas['POST /api/envios/previsualizar'] = PREVIA;
    respuestas['POST /api/envios'] = {
      envioId: 'e1',
      solicitadas: 2,
      encoladas: 2,
      omitidasSinTelefono: 0,
      omitidasBaja: 0,
      omitidasEstado: 0,
      programadoPara: null,
    };
    respuestas['GET /api/envios/e1'] = {
      id: 'e1',
      solicitadas: 2,
      encoladas: 2,
      omitidasSinTelefono: 1,
      omitidasBaja: 0,
      omitidasEstado: 0,
      terminado: true,
      mensajes: { en_cola: 0, enviado: 1, entregado: 1, leido: 0, fallido: 0 },
    };
    montar();
    await screen.findByText('Paciente a');
    fireEvent.click(casilla(/Seleccionar a Paciente a/));
    fireEvent.click(casilla(/Seleccionar a Paciente b/));
    fireEvent.click(screen.getByRole('button', { name: /Enviar confirmación/ }));

    const dialogo = await screen.findByRole('dialog', { name: 'Confirmar el envío' });
    expect(await within(dialogo).findByText('2 pacientes', { selector: 'strong' })).toBeTruthy();
    expect(within(dialogo).getByText(/Recordatorio de CESFAM Centro/)).toBeTruthy();
    expect(within(dialogo).getByText(/quedarán en «Pendientes por llamar»/)).toBeTruthy();
    expect(cuerpo('POST', '/api/envios/previsualizar')).toEqual({
      centro: 'CSC',
      citaIds: ['a', 'b'],
    });
    expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/api/envios')).toBe(false); // aún no envía

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar a 2 pacientes' }));
    expect(await screen.findByText('Envío en curso')).toBeTruthy();
    expect(cuerpo('POST', '/api/envios')).toEqual({ centro: 'CSC', citaIds: ['a', 'b'] });
    expect(await screen.findByText(/Envío terminado/)).toBeTruthy();
    expect(screen.getByText('Ninguna cita seleccionada')).toBeTruthy(); // la selección se limpió
  });

  it('mientras avanza el envío la tabla se vuelve a consultar (no queda mostrando «Sin enviar» con datos viejos)', async () => {
    respuestas['POST /api/envios/previsualizar'] = PREVIA;
    respuestas['POST /api/envios'] = {
      envioId: 'e1',
      solicitadas: 1,
      encoladas: 1,
      omitidasSinTelefono: 0,
      omitidasBaja: 0,
      omitidasEstado: 0,
      programadoPara: null,
    };
    respuestas['GET /api/envios/e1'] = {
      id: 'e1',
      solicitadas: 1,
      encoladas: 1,
      omitidasSinTelefono: 0,
      omitidasBaja: 0,
      omitidasEstado: 0,
      terminado: true,
      mensajes: { en_cola: 0, enviado: 1, entregado: 0, leido: 0, fallido: 0 },
    };
    montar();
    await screen.findByText('Paciente a');
    fireEvent.click(casilla(/Seleccionar a Paciente a/));
    fireEvent.click(screen.getByRole('button', { name: /Enviar confirmación/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Confirmar el envío' });
    fireEvent.click(await within(dialogo).findByRole('button', { name: /Enviar a 2 pacientes/ }));
    await screen.findByText(/Envío terminado/);

    await waitFor(() => {
      const iProgreso = llamadas.findIndex((l) => l.ruta === '/api/envios/e1');
      const despues = llamadas
        .slice(iProgreso + 1)
        .filter((l) => l.ruta.startsWith('/api/confirmaciones'));
      expect(iProgreso).toBeGreaterThan(-1);
      expect(despues.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('cancelar el diálogo no envía nada', async () => {
    respuestas['POST /api/envios/previsualizar'] = PREVIA;
    montar();
    await screen.findByText('Paciente a');
    fireEvent.click(casilla(/Seleccionar a Paciente a/));
    fireEvent.click(screen.getByRole('button', { name: /Enviar confirmación/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Confirmar el envío' });
    await within(dialogo).findByText('2 pacientes', { selector: 'strong' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/api/envios')).toBe(false);
  });

  it('fuera del horario avisa a qué hora saldrán los mensajes', async () => {
    respuestas['POST /api/envios/previsualizar'] = {
      ...PREVIA,
      programadoPara: '2026-11-20T12:00:00.000Z',
    };
    montar();
    await screen.findByText('Paciente a');
    fireEvent.click(casilla(/Seleccionar a Paciente a/));
    fireEvent.click(screen.getByRole('button', { name: /Enviar confirmación/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Confirmar el envío' });
    expect(await within(dialogo).findByText(/fuera del horario de envío/)).toBeTruthy();
  });

  it('no permite confirmar si no queda nadie a quien enviar', async () => {
    respuestas['POST /api/envios/previsualizar'] = { ...PREVIA, aEnviar: 0, mensaje: null };
    montar();
    await screen.findByText('Paciente a');
    fireEvent.click(casilla(/Seleccionar a Paciente a/));
    fireEvent.click(screen.getByRole('button', { name: /Enviar confirmación/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Confirmar el envío' });
    await within(dialogo).findByText('0 pacientes', { selector: 'strong' });
    expect(
      (within(dialogo).getByRole('button', { name: /Enviar a 0/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('en la demo puede simular las respuestas de los pacientes; si no es demo, el botón no existe', async () => {
    respuestas['POST /api/envios/simular-respuestas'] = {
      confirmadas: 3,
      canceladas: 1,
      bajas: 0,
      sinResponder: 1,
      sinEntregar: 0,
    };
    montar();
    await screen.findByText('Paciente a');
    fireEvent.click(screen.getByRole('button', { name: /Simular respuestas de pacientes/ }));
    expect(await screen.findByText(/3 confirmaron, 1 cancelaron/)).toBeTruthy();
    expect(cuerpo('POST', '/api/envios/simular-respuestas')).toEqual({ centro: 'CSC' });

    cleanup();
    respuestas['GET /api/confirmaciones'] = {
      ...LISTADO,
      opciones: { ...LISTADO.opciones, modo: 'cloud', puedeSimular: false },
    };
    montar();
    await screen.findByText('Paciente a');
    expect(screen.queryByRole('button', { name: /Simular respuestas/ })).toBeNull();
  });

  it('lista las horas por liberar en AVIS y permite marcarlas como liberadas', async () => {
    respuestas['GET /api/liberaciones'] = [
      {
        id: 'l1',
        fecha: '2026-11-25',
        hora: '09:30',
        paciente: 'Paciente x',
        rut: '1.000.***-7',
        profesional: 'Dra. Demo Uno',
        centro: 'CSC',
      },
    ];
    respuestas['POST /api/liberaciones/l1/resolver'] = { id: 'l1', resuelta: true };
    montar();
    expect(await screen.findByText(/Horas por liberar en AVIS \(1\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ya la liberé: Paciente x' }));
    await waitFor(() =>
      expect(
        llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/api/liberaciones/l1/resolver'),
      ).toBe(true),
    );
  });

  it('día sin citas: mensaje claro', async () => {
    respuestas['GET /api/confirmaciones'] = {
      ...LISTADO,
      filas: [],
      resumen: { sin_enviar: 0, enviado: 0, confirmado: 0, sin_respuesta: 0, cancelado: 0 },
    };
    montar();
    expect(await screen.findByText(/No hay citas de ese tipo para esa fecha/)).toBeTruthy();
  });

  it('encargado: debe elegir el centro antes de ver citas', async () => {
    respuestas['GET /api/me'] = me('encargado', null);
    respuestas['GET /api/centros'] = [
      CENTRO,
      { id: 'c2', codigo: 'CSN', nombre: 'CESFAM Norte (DEMO)' },
    ];
    montar();
    expect(await screen.findByText('Elige un centro para ver sus citas.')).toBeTruthy();
    expect(llamadas.some((l) => l.ruta.startsWith('/api/confirmaciones'))).toBe(false);
    await screen.findByRole('option', { name: 'CESFAM Norte (DEMO)' });
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'CSN' } });
    await screen.findByText('Paciente a');
    expect(llamadas.find((l) => l.ruta.startsWith('/api/confirmaciones'))!.ruta).toContain(
      'centro=CSN',
    );
  });
});
