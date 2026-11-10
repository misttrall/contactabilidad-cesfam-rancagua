import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      const clave = `${metodo} ${ruta.split('?')[0]}`;
      const r = respuestas[clave];
      if (r === undefined) throw new Error(`Sin respuesta simulada para ${clave}`);
      if (r instanceof Error) throw r;
      return typeof r === 'function' ? (r as (ruta: string) => unknown)(ruta) : r;
    }),
  };
});
vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({ estado: 'autenticado', iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('./auth/auth', () => ({ userManager: {} }));

import { ApiError } from './api/cliente';
import { DatoSensible } from './componentes/DatoSensible';
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

function montar(ruta: string) {
  const router = crearRouter({ history: createMemoryHistory({ initialEntries: [ruta] }) });
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
const rutasGet = (prefijo: string) =>
  llamadas.filter((l) => l.metodo === 'GET' && l.ruta.startsWith(prefijo)).map((l) => l.ruta);

beforeEach(() => {
  window.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  llamadas.length = 0;
  respuestas = { 'GET /api/me': me('funcionaria', CENTRO), 'GET /api/centros': [CENTRO] };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// =========================================================================================
// Pendientes por llamar
// =========================================================================================

const pend = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  pacienteId: `p-${id}`,
  fecha: '2026-11-25',
  hora: '09:00',
  paciente: `Paciente ${id}`,
  telefono: '+56 9 **** 0001',
  profesional: 'Dra. Demo Uno',
  prestacion: 'Control',
  tipo: 'cronico',
  subestado: null,
  vencida: false,
  adultoMayor: false,
  bajaWhatsApp: false,
  intentos: 0,
  ultimoIntento: null,
  ...o,
});
const CONTACTOS = {
  estado: 'sin_respuesta',
  subestado: null,
  mensajes: [
    {
      tipo: 'confirmacion',
      estado: 'leido',
      enviadoEn: '2026-11-20T15:00:00Z',
      leidoEn: '2026-11-20T16:00:00Z',
    },
  ],
  llamadas: [
    {
      id: 'l1',
      resultado: 'recado',
      observacion: 'Dejé mensaje con la madre',
      creadaEn: '2026-11-21T15:00:00Z',
      registradoPor: 'Funcionaria Ana',
    },
  ],
};

describe('Pendientes por llamar', () => {
  beforeEach(() => {
    respuestas['GET /api/pendientes'] = {
      filas: [
        pend('a', { adultoMayor: true, hora: '10:00' }),
        pend('b', {
          intentos: 2,
          subestado: 'no_ubicado',
          ultimoIntento: { resultado: 'no_ubicado', creadaEn: '2026-11-21T15:00:00Z' },
        }),
        pend('c', { bajaWhatsApp: true }),
      ],
    };
    respuestas['GET /api/pendientes/a/contactos'] = CONTACTOS;
    respuestas['GET /api/pendientes/b/contactos'] = { ...CONTACTOS, llamadas: [] };
    respuestas['GET /api/pendientes/c/contactos'] = { ...CONTACTOS, mensajes: [], llamadas: [] };
  });

  it('muestra la cola en el orden del servidor con adulto mayor, intentos y subestado, y recuerda que nunca se cancela', async () => {
    montar('/pendientes');
    expect(await screen.findByText('Paciente a')).toBeTruthy();
    expect(screen.getByText(/nunca cancela la hora/)).toBeTruthy();
    expect(screen.getByText('Adulto mayor')).toBeTruthy();
    expect(screen.getByText(/2 intentos/)).toBeTruthy();
    expect(screen.getByText('No ubicado', { selector: '.bh-badge span' })).toBeTruthy(); // subestado, en la familia ámbar
    expect(screen.getAllByText('Sin llamar', { selector: 'span' })).toHaveLength(2); // a y c no tienen llamadas
    expect(screen.getByText('3 pacientes pendientes')).toBeTruthy();
    const filas = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[1]!.textContent);
    expect(filas[0]).toContain('Paciente a');
    expect(rutasGet('/api/pendientes?')[0]).toContain('centro=CSC');
  });

  it('abre el detalle con el teléfono enmascarado y los contactos anteriores (con quién los hizo)', async () => {
    montar('/pendientes');
    fireEvent.click(await screen.findByRole('button', { name: 'Llamar a Paciente a' }));
    const panel = await screen.findByRole('dialog', { name: 'Registrar llamada' });
    expect(within(panel).getByText('+56 9 **** 0001')).toBeTruthy();
    expect(await within(panel).findByText(/Funcionaria Ana/)).toBeTruthy();
    expect(within(panel).getByText(/Dejé mensaje con la madre/)).toBeTruthy();
    expect(within(panel).getByText(/WhatsApp \(confirmacion\) · leído/)).toBeTruthy();
  });

  it('el teléfono completo solo se muestra al pedirlo (se consulta al servidor) y se puede ocultar', async () => {
    respuestas['POST /api/pacientes/p-a/revelar'] = { campo: 'telefono', valor: '+56912345678' };
    montar('/pendientes');
    fireEvent.click(await screen.findByRole('button', { name: 'Llamar a Paciente a' }));
    const panel = await screen.findByRole('dialog', { name: 'Registrar llamada' });
    expect(llamadas.some((l) => l.ruta.includes('/revelar'))).toBe(false); // nada se pide hasta pulsar «Mostrar»

    fireEvent.click(within(panel).getByRole('button', { name: 'Mostrar teléfono completo' }));
    expect(await within(panel).findByText('+56912345678')).toBeTruthy();
    expect(within(panel).getByText(/Este acceso quedó registrado/)).toBeTruthy();
    expect(cuerpo('POST', '/api/pacientes/p-a/revelar')).toEqual({ campo: 'telefono' });

    fireEvent.click(within(panel).getByRole('button', { name: 'Ocultar teléfono' }));
    expect(within(panel).queryByText('+56912345678')).toBeNull();
    expect(within(panel).getByText('+56 9 **** 0001')).toBeTruthy();
  });

  it('avisa si el paciente pidió no recibir WhatsApp', async () => {
    montar('/pendientes');
    fireEvent.click(await screen.findByRole('button', { name: 'Llamar a Paciente c' }));
    const panel = await screen.findByRole('dialog', { name: 'Registrar llamada' });
    expect(within(panel).getByText(/pidió no recibir más mensajes por WhatsApp/)).toBeTruthy();
  });

  it('no permite registrar sin elegir resultado; «Recado» recuerda que la cita sigue vigente', async () => {
    montar('/pendientes');
    fireEvent.click(await screen.findByRole('button', { name: 'Llamar a Paciente a' }));
    const panel = await screen.findByRole('dialog', { name: 'Registrar llamada' });
    const registrar = within(panel).getByRole('button', {
      name: 'Registrar resultado',
    }) as HTMLButtonElement;
    expect(registrar.disabled).toBe(true);
    expect(within(panel).getByText(/No escribas datos clínicos/)).toBeTruthy();

    fireEvent.click(within(panel).getByRole('radio', { name: /Recado dejado/ }));
    expect(
      within(panel).getByText(/La cita sigue vigente. «Sin respuesta» nunca cancela/),
    ).toBeTruthy();
    expect(registrar.disabled).toBe(false);
  });

  it('los atajos 1 a 4 eligen el resultado', async () => {
    montar('/pendientes');
    fireEvent.click(await screen.findByRole('button', { name: 'Llamar a Paciente a' }));
    const panel = await screen.findByRole('dialog', { name: 'Registrar llamada' });
    const grupo = within(panel).getByRole('group', { name: 'Resultado de la llamada' });
    fireEvent.keyDown(grupo, { key: '3' });
    expect(
      (within(panel).getByRole('radio', { name: /No ubicado/ }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.keyDown(grupo, { key: '4' });
    expect(
      (within(panel).getByRole('radio', { name: /Cancelado por el paciente/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it('registra el resultado con su observación y pasa a la siguiente paciente', async () => {
    respuestas['POST /api/pendientes/a/resultado'] = {
      estado: 'sin_respuesta',
      liberarEnAvis: false,
    };
    montar('/pendientes');
    fireEvent.click(await screen.findByRole('button', { name: 'Llamar a Paciente a' }));
    const panel = await screen.findByRole('dialog', { name: 'Registrar llamada' });
    fireEvent.click(within(panel).getByRole('radio', { name: /Recado dejado/ }));
    fireEvent.change(within(panel).getByLabelText(/Observación/), {
      target: { value: 'Dejé mensaje' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar resultado' }));

    await waitFor(() =>
      expect(cuerpo('POST', '/api/pendientes/a/resultado')).toEqual({
        resultado: 'recado',
        observacion: 'Dejé mensaje',
      }),
    );
    expect(await screen.findByText(/Registrado: Recado dejado/)).toBeTruthy();
    // el panel queda abierto en el siguiente paciente (b)
    expect(
      within(await screen.findByRole('dialog', { name: 'Registrar llamada' })).getByText(
        'Paciente b',
      ),
    ).toBeTruthy();
  });

  it('«Cancelado» recuerda liberar la hora en AVIS', async () => {
    respuestas['POST /api/pendientes/a/resultado'] = { estado: 'cancelado', liberarEnAvis: true };
    montar('/pendientes');
    fireEvent.click(await screen.findByRole('button', { name: 'Llamar a Paciente a' }));
    const panel = await screen.findByRole('dialog', { name: 'Registrar llamada' });
    fireEvent.click(within(panel).getByRole('radio', { name: /Cancelado por el paciente/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar resultado' }));
    expect(await screen.findByText(/Recuerda liberar la hora en AVIS/)).toBeTruthy();
  });

  it('si otra persona ya resolvió la cita, muestra el error del servidor', async () => {
    respuestas['POST /api/pendientes/a/resultado'] = new ApiError(
      409,
      'La cita ya está confirmada o cancelada',
    );
    montar('/pendientes');
    fireEvent.click(await screen.findByRole('button', { name: 'Llamar a Paciente a' }));
    const panel = await screen.findByRole('dialog', { name: 'Registrar llamada' });
    fireEvent.click(within(panel).getByRole('radio', { name: /Confirmado/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar resultado' }));
    expect((await within(panel).findByRole('alert')).textContent).toContain(
      'ya está confirmada o cancelada',
    );
  });

  it('sin pendientes: mensaje claro; el encargado debe elegir centro antes de consultar', async () => {
    respuestas['GET /api/pendientes'] = { filas: [] };
    montar('/pendientes');
    expect(await screen.findByText(/No hay pacientes pendientes por llamar/)).toBeTruthy();

    cleanup();
    llamadas.length = 0;
    respuestas['GET /api/me'] = me('encargado', null);
    respuestas['GET /api/centros'] = [
      CENTRO,
      { id: 'c2', codigo: 'CSN', nombre: 'CESFAM Norte (DEMO)' },
    ];
    montar('/pendientes');
    expect(await screen.findByText('Elige un centro para ver sus pendientes.')).toBeTruthy();
    expect(rutasGet('/api/pendientes').length).toBe(0);
    await screen.findByRole('option', { name: 'CESFAM Norte (DEMO)' });
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'CSN' } });
    await waitFor(() => expect(rutasGet('/api/pendientes?')[0]).toContain('centro=CSN'));
  });
});

describe('DatoSensible', () => {
  it('se oculta solo a los 30 segundos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <DatoSensible
        etiqueta="Teléfono"
        enmascarado="+56 9 **** 0001"
        obtener={async () => '+56912345678'}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Mostrar/ }));
    expect(await screen.findByText('+56912345678')).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(29_000);
    });
    expect(screen.getByText('+56912345678')).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.queryByText('+56912345678')).toBeNull();
    expect(screen.getByText('+56 9 **** 0001')).toBeTruthy();
  });

  it('copia al portapapeles y avisa si falla al obtener el dato', async () => {
    const escribir = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText: escribir } });
    const { unmount } = render(
      <DatoSensible etiqueta="Teléfono" enmascarado="****" obtener={async () => '+56912345678'} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Mostrar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Copiar/ }));
    await waitFor(() => expect(escribir).toHaveBeenCalledWith('+56912345678'));
    expect(await screen.findByText('Copiado')).toBeTruthy();
    unmount();

    render(
      <DatoSensible
        etiqueta="Teléfono"
        enmascarado="****"
        obtener={async () => {
          throw new Error('Sin permiso');
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Mostrar/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Sin permiso');
    expect(screen.getByText('****')).toBeTruthy(); // sigue enmascarado
  });
});

// =========================================================================================
// Llamada entrante
// =========================================================================================

const MOTIVOS = [
  { id: 'm1', codigo: 'SOL_HORA', descripcion: 'Solicitud de hora' },
  { id: 'm2', codigo: 'CONS_RESULT', descripcion: 'Consulta de resultados' },
  { id: 'm3', codigo: 'REAG_CITA', descripcion: 'Reagendamiento' },
  { id: 'm7', codigo: 'OTROS', descripcion: 'Otros' },
];
const RUT_OK = '1000001-7';

async function escribirRut(texto = '10000017') {
  const input = (await screen.findByLabelText('RUT del paciente')) as HTMLInputElement;
  fireEvent.change(input, { target: { value: texto } });
  return input;
}

describe('Llamada entrante', () => {
  beforeEach(() => {
    respuestas['GET /api/motivos'] = MOTIVOS;
    respuestas['GET /api/llamadas-entrantes'] = {
      total: 0,
      pagina: 1,
      tam: 5,
      paginas: 1,
      filas: [],
    };
    respuestas['GET /api/pacientes/buscar'] = {
      encontrado: true,
      paciente: {
        id: 'p1',
        nombre: 'Paciente Demo 001',
        edad: 68,
        adultoMayor: true,
        telefono: '+56 9 **** 0001',
      },
      proximasCitas: [
        { fecha: '2026-11-25', hora: '09:00', profesional: 'Dra. Demo Uno', estado: 'confirmado' },
      ],
    };
    respuestas['POST /api/llamadas-entrantes'] = { id: 'x', pacienteEncontrado: true };
  });

  it('el RUT toma el foco al abrir; Enter busca y muestra al paciente (datos enmascarados) y sus citas', async () => {
    montar('/llamadas/nueva');
    const input = await escribirRut();
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.value).toBe('1.000.001-7');
    fireEvent.keyDown(input, { key: 'Enter' });

    const tarjeta = await screen.findByRole('article', { name: 'Paciente encontrado' });
    expect(within(tarjeta).getByText(/Paciente Demo 001/)).toBeTruthy();
    expect(within(tarjeta).getByText('Adulto mayor')).toBeTruthy();
    expect(within(tarjeta).getByText(/\+56 9 \*\*\*\* 0001/)).toBeTruthy();
    expect(within(tarjeta).getByText(/Confirmado/)).toBeTruthy();
    expect(rutasGet('/api/pacientes/buscar')[0]).toContain(`rut=${RUT_OK}`);
  });

  it('un RUT no cargado avisa que se registrará solo con el RUT', async () => {
    respuestas['GET /api/pacientes/buscar'] = { encontrado: false };
    montar('/llamadas/nueva');
    const input = await escribirRut();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText(/no está cargado en este centro/)).toBeTruthy();
  });

  it('un RUT inválido no busca y muestra el error', async () => {
    montar('/llamadas/nueva');
    const input = await escribirRut('10000019');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText(/RUT no válido/)).toBeTruthy();
    expect(rutasGet('/api/pacientes/buscar').length).toBe(0);
  });

  it('el botón se habilita solo con RUT válido y motivo; «Otros» exige el detalle', async () => {
    montar('/llamadas/nueva');
    const registrar = (await screen.findByRole('button', {
      name: 'Registrar llamada',
    })) as HTMLButtonElement;
    expect(registrar.disabled).toBe(true);
    await escribirRut();
    expect(registrar.disabled).toBe(true); // falta el motivo
    fireEvent.change(screen.getByLabelText('Todos los motivos'), { target: { value: 'm1' } });
    expect(registrar.disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('Todos los motivos'), { target: { value: 'm7' } });
    expect(registrar.disabled).toBe(true);
    fireEvent.change(await screen.findByLabelText(/Especificar motivo/), {
      target: { value: 'Ab' },
    });
    expect(registrar.disabled).toBe(true); // mínimo 3 caracteres
    fireEvent.change(screen.getByLabelText(/Especificar motivo/), {
      target: { value: 'Transporte' },
    });
    expect(registrar.disabled).toBe(false);
  });

  it('los tres primeros motivos están a un clic', async () => {
    montar('/llamadas/nueva');
    const chip = await screen.findByRole('button', { name: 'Consulta de resultados' });
    expect(screen.queryByRole('button', { name: 'Otros' })).toBeNull(); // el 4.º solo está en la lista
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Todos los motivos') as HTMLSelectElement).value).toBe('m2');
  });

  it('Ctrl+Enter registra con el tiempo que tardó, limpia el formulario y vuelve al RUT', async () => {
    montar('/llamadas/nueva');
    const input = await escribirRut();
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitud de hora' }));
    fireEvent.change(screen.getByLabelText(/Observación/), {
      target: { value: 'Pide hora con la doctora' },
    });
    fireEvent.keyDown(screen.getByLabelText(/Observación/), { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(cuerpo('POST', '/api/llamadas-entrantes')).toBeTruthy());
    const c = cuerpo('POST', '/api/llamadas-entrantes');
    expect(c).toMatchObject({
      rut: RUT_OK,
      motivoId: 'm1',
      observacion: 'Pide hora con la doctora',
    });
    expect(c.centro).toBeUndefined(); // la funcionaria no envía centro: es el suyo
    expect(typeof c.segundos).toBe('number');

    expect(await screen.findByText(/Llamada registrada en \d+ s\./)).toBeTruthy();
    const nuevo = (await screen.findByLabelText('RUT del paciente')) as HTMLInputElement;
    expect(nuevo.value).toBe('');
    await waitFor(() => expect(document.activeElement).toBe(nuevo));
    expect(input).not.toBe(nuevo); // el formulario se montó de nuevo
  });

  it('«Otros» envía el detalle; si el paciente no estaba cargado lo dice', async () => {
    respuestas['POST /api/llamadas-entrantes'] = { id: 'x', pacienteEncontrado: false };
    montar('/llamadas/nueva');
    await escribirRut();
    fireEvent.change(screen.getByLabelText('Todos los motivos'), { target: { value: 'm7' } });
    fireEvent.change(await screen.findByLabelText(/Especificar motivo/), {
      target: { value: 'Consulta por transporte' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar llamada' }));
    await waitFor(() =>
      expect(cuerpo('POST', '/api/llamadas-entrantes')).toMatchObject({
        motivoId: 'm7',
        otroMotivo: 'Consulta por transporte',
      }),
    );
    expect(await screen.findByText(/quedó solo con el RUT/)).toBeTruthy();
  });

  it('muestra el error del servidor y conserva lo escrito', async () => {
    respuestas['POST /api/llamadas-entrantes'] = new ApiError(
      400,
      'El motivo no existe o está inactivo',
    );
    montar('/llamadas/nueva');
    const input = await escribirRut();
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitud de hora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar llamada' }));
    expect((await screen.findByRole('alert')).textContent).toContain('motivo no existe');
    expect(input.value).toBe('1.000.001-7');
  });

  it('el encargado debe elegir el centro y se envía en la solicitud', async () => {
    respuestas['GET /api/me'] = me('encargado', null);
    respuestas['GET /api/centros'] = [
      CENTRO,
      { id: 'c2', codigo: 'CSN', nombre: 'CESFAM Norte (DEMO)' },
    ];
    montar('/llamadas/nueva');
    await screen.findByRole('option', { name: 'CESFAM Norte (DEMO)' });
    await escribirRut();
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitud de hora' }));
    const registrar = screen.getByRole('button', {
      name: 'Registrar llamada',
    }) as HTMLButtonElement;
    expect(registrar.disabled).toBe(true); // falta el centro
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'CSN' } });
    expect(registrar.disabled).toBe(false);
    fireEvent.click(registrar);
    await waitFor(() =>
      expect(cuerpo('POST', '/api/llamadas-entrantes')).toMatchObject({ centro: 'CSN' }),
    );
  });

  it('lista lo registrado hoy', async () => {
    respuestas['GET /api/llamadas-entrantes'] = {
      total: 1,
      pagina: 1,
      tam: 5,
      paginas: 1,
      filas: [
        {
          id: 'h1',
          creadaEn: '2026-11-20T15:00:00Z',
          centro: 'CSC',
          paciente: 'Paciente Demo 001',
          rut: '1.000.***-7',
          motivo: 'Solicitud de hora',
          otroMotivo: null,
          observacion: null,
          registradoPor: 'Ana',
          segundos: 18,
        },
      ],
    };
    montar('/llamadas/nueva');
    expect(await screen.findByText(/Paciente Demo 001 · Solicitud de hora/)).toBeTruthy();
    expect(screen.getByText(/18 s/)).toBeTruthy();
  });
});

// =========================================================================================
// Historial
// =========================================================================================

const fila = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  creadaEn: '2026-11-20T15:00:00Z',
  centro: 'CSC',
  paciente: `Paciente ${id}`,
  rut: '1.000.***-7',
  motivo: 'Solicitud de hora',
  otroMotivo: null,
  observacion: null,
  registradoPor: 'Ana',
  segundos: 22,
  ...o,
});

describe('Historial de llamadas', () => {
  beforeEach(() => {
    respuestas['GET /api/motivos'] = MOTIVOS;
    respuestas['GET /api/llamadas-entrantes'] = (ruta: string) => {
      const pagina = Number(new URLSearchParams(ruta.split('?')[1]).get('pagina') ?? '1');
      return {
        total: 60,
        pagina,
        tam: 25,
        paginas: 3,
        filas: [
          fila(`p${pagina}a`),
          fila(`p${pagina}b`, {
            paciente: null,
            motivo: 'Otros',
            otroMotivo: 'Transporte',
            observacion: 'Pregunta por el bus',
            segundos: null,
          }),
        ],
      };
    };
  });

  it('carga los últimos 7 días con RUT enmascarado, «No cargado» y el detalle de «Otros»', async () => {
    montar('/llamadas');
    expect(await screen.findByText('Paciente p1a')).toBeTruthy();
    expect(screen.getByText('No cargado')).toBeTruthy();
    expect(screen.getByText('Transporte')).toBeTruthy();
    expect(screen.getByText('Pregunta por el bus')).toBeTruthy();
    expect(screen.getByText('60 llamadas · página 1 de 3')).toBeTruthy();
    const q = new URLSearchParams(rutasGet('/api/llamadas-entrantes?')[0]!.split('?')[1]);
    expect(q.get('desde')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(q.get('hasta')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(q.get('tam')).toBe('25');
    expect(screen.queryByRole('columnheader', { name: 'Centro' })).toBeNull(); // la funcionaria ve solo el suyo
  });

  it('pagina en el servidor y los botones respetan los extremos', async () => {
    montar('/llamadas');
    await screen.findByText('Paciente p1a');
    const anterior = screen.getByRole('button', { name: /Anterior/ }) as HTMLButtonElement;
    expect(anterior.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(await screen.findByText('Paciente p2a')).toBeTruthy();
    expect(screen.getByText('60 llamadas · página 2 de 3')).toBeTruthy();
    expect(rutasGet('/api/llamadas-entrantes?').some((r) => r.includes('pagina=2'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    await screen.findByText('Paciente p3a');
    expect((screen.getByRole('button', { name: /Siguiente/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('cambiar un filtro vuelve a la primera página', async () => {
    montar('/llamadas');
    await screen.findByText('Paciente p1a');
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    await screen.findByText('Paciente p2a');
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'm1' } });
    await waitFor(() => {
      const ultima = rutasGet('/api/llamadas-entrantes?').at(-1)!;
      expect(ultima).toContain('motivoId=m1');
      expect(ultima).toContain('pagina=1');
    });
  });

  it('busca por RUT o nombre; una búsqueda de un solo carácter se ignora', async () => {
    montar('/llamadas');
    await screen.findByText('Paciente p1a');
    const antes = rutasGet('/api/llamadas-entrantes?').length;
    fireEvent.change(screen.getByLabelText('RUT o nombre'), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(rutasGet('/api/llamadas-entrantes?').length).toBe(antes);

    fireEvent.change(screen.getByLabelText('RUT o nombre'), { target: { value: 'Perez' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(rutasGet('/api/llamadas-entrantes?').at(-1)).toContain('q=Perez'));
  });

  it('el encargado ve la columna Centro y puede filtrar por centro', async () => {
    respuestas['GET /api/me'] = me('encargado', null);
    respuestas['GET /api/centros'] = [
      CENTRO,
      { id: 'c2', codigo: 'CSN', nombre: 'CESFAM Norte (DEMO)' },
    ];
    montar('/llamadas');
    await screen.findByText('Paciente p1a');
    expect(screen.getByRole('columnheader', { name: 'Centro' })).toBeTruthy();
    await screen.findByRole('option', { name: 'CESFAM Norte (DEMO)' });
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'CSN' } });
    await waitFor(() =>
      expect(rutasGet('/api/llamadas-entrantes?').at(-1)).toContain('centro=CSN'),
    );
  });

  it('sin resultados: mensaje claro; con error: lo muestra', async () => {
    respuestas['GET /api/llamadas-entrantes'] = {
      total: 0,
      pagina: 1,
      tam: 25,
      paginas: 1,
      filas: [],
    };
    montar('/llamadas');
    expect(await screen.findByText('No hay llamadas con esos filtros.')).toBeTruthy();
    cleanup();
    respuestas['GET /api/llamadas-entrantes'] = new ApiError(500, 'Error del servidor');
    montar('/llamadas');
    expect((await screen.findByRole('alert')).textContent).toContain('Error del servidor');
  });
});
