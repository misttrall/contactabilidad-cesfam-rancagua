import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modulosPermitidos, type Rol } from '@bh/shared';

// --- Mocks: sin red ni Keycloak ---------------------------------------------------------------
type Llamada = { metodo: string; ruta: string; body?: unknown };
const llamadas: Llamada[] = [];
let respuestas: Record<string, unknown | Error> = {};
const apiBlob = vi.fn();

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
    apiBlob: (...a: unknown[]) => apiBlob(...a),
    apiFetch: vi.fn(async (ruta: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET';
      llamadas.push({ metodo, ruta, body: init?.body });
      const r = respuestas[`${metodo} ${ruta}`];
      if (r === undefined) throw new Error(`Sin respuesta simulada para ${metodo} ${ruta}`);
      if (r instanceof Error) throw r;
      return r;
    }),
  };
});
vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({ estado: 'autenticado', iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('./auth/auth', () => ({ userManager: {} }));

import { ApiError } from './api/cliente';
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
const RESUMEN = {
  totalFilas: 5,
  validas: 3,
  citasNuevas: 2,
  citasYaCargadas: 1,
  excluidasMorbilidad: 1,
  repetidasEnArchivo: 0,
  erroresTotal: 1,
  errores: [{ fila: 4, columna: 'RUT', mensaje: 'RUT no válido: revisa el dígito verificador' }],
  columnasReconocidas: ['Paciente', 'RUT'],
  columnasIgnoradas: ['Observaciones'],
  vistaPrevia: [
    {
      paciente: 'Paciente Demo 001',
      rut: '1.000.***-7',
      telefono: '+56 9 **** 5678',
      fecha: '2026-11-20',
      hora: '09:30',
      profesional: 'Dra. Demo Uno',
      prestacion: 'Control crónico',
      tipo: 'cronico',
    },
  ],
  limites: { maxFilas: 5000, maxMegabytes: 5 },
};
const RESULTADO = {
  cargaId: 'k1',
  filasTotales: 5,
  citasCreadas: 2,
  citasExistentes: 1,
  pacientesNuevos: 2,
  pacientesActualizados: 0,
  morbilidadExcluida: 1,
  repetidasEnArchivo: 0,
  erroresTotal: 1,
};
const HISTORIAL = {
  opciones: { excluirMorbilidadPorDefecto: true, maxFilas: 5000, maxMegabytes: 5 },
  historial: [
    {
      id: 'h1',
      creadaEn: '2026-11-10T15:00:00.000Z',
      filasTotales: 10,
      citasCreadas: 8,
      citasExistentes: 2,
      erroresTotal: 0,
      centro: { codigo: 'CSC' },
    },
  ],
};

function montar() {
  const router = crearRouter({ history: createMemoryHistory({ initialEntries: ['/cargas'] }) });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
const archivo = () => new File(['x'], 'planilla.xlsx');
const elegirArchivo = async () => {
  const input = (await screen.findByLabelText(/Planilla exportada desde AVIS/)) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [archivo()] } });
};
const formulario = (metodo: string, ruta: string) =>
  llamadas.find((l) => l.metodo === metodo && l.ruta === ruta)?.body as FormData | undefined;

beforeEach(() => {
  window.scrollTo = vi.fn();
  llamadas.length = 0;
  apiBlob.mockReset();
  respuestas = { 'GET /api/me': me('funcionaria', CENTRO), 'GET /api/cargas': HISTORIAL };
});
afterEach(cleanup);

describe('Asistente de carga de planilla', () => {
  it('funcionaria: el centro es fijo y no puede revisar sin elegir un archivo', async () => {
    montar();
    expect(await screen.findByText('CESFAM Centro (DEMO)', { selector: 'p' })).toBeTruthy();
    expect(screen.queryByLabelText('Centro de la planilla')).toBeNull();
    const boton = screen.getByRole('button', { name: /Revisar planilla/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    await elegirArchivo();
    expect(boton.disabled).toBe(false);
    expect(screen.getByText(/solo planillas con datos ficticios/)).toBeTruthy(); // aviso DEMO
  });

  it('paso 1 -> 2: envía centro, opción de morbilidad y archivo; muestra resumen, vista previa enmascarada y errores', async () => {
    respuestas['POST /api/cargas/validar'] = RESUMEN;
    montar();
    await elegirArchivo();
    fireEvent.click(screen.getByRole('button', { name: /Revisar planilla/ }));

    expect(await screen.findByText('Vista previa')).toBeTruthy();
    const f = formulario('POST', '/api/cargas/validar')!;
    expect(f.get('centro')).toBe('CSC');
    expect(f.get('excluirMorbilidad')).toBe('true');
    expect((f.get('archivo') as File).name).toBe('planilla.xlsx');

    expect(screen.getByText('1.000.***-7')).toBeTruthy(); // nunca el RUT completo
    expect(screen.getByText('Errores por corregir en el Excel')).toBeTruthy();
    const errores = screen.getByText('Errores por corregir en el Excel').parentElement!;
    expect(within(errores).getByText('RUT no válido: revisa el dígito verificador')).toBeTruthy();
    expect(screen.getByText(/Se ignoran: Observaciones/)).toBeTruthy();
    expect(screen.getByText(/las 1 con errores quedan fuera/)).toBeTruthy();
  });

  it('desmarcar "excluir morbilidad" se envía como false', async () => {
    respuestas['POST /api/cargas/validar'] = RESUMEN;
    montar();
    await elegirArchivo();
    fireEvent.click(await screen.findByLabelText(/Excluir morbilidad/));
    fireEvent.click(screen.getByRole('button', { name: /Revisar planilla/ }));
    await screen.findByText('Vista previa');
    expect(formulario('POST', '/api/cargas/validar')!.get('excluirMorbilidad')).toBe('false');
  });

  it('paso 2 -> 3: importa y ofrece continuar con la confirmación masiva', async () => {
    respuestas['POST /api/cargas/validar'] = RESUMEN;
    respuestas['POST /api/cargas'] = RESULTADO;
    montar();
    await elegirArchivo();
    fireEvent.click(screen.getByRole('button', { name: /Revisar planilla/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Importar 2 citas' }));

    expect(await screen.findByText('Carga completada')).toBeTruthy();
    expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/api/cargas')).toBe(true);
    expect(screen.getByText(/conservan su estado de contacto/)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Ir a confirmación masiva' }).getAttribute('href'),
    ).toBe('/confirmaciones');
  });

  it('sin citas nuevas no se puede importar', async () => {
    respuestas['POST /api/cargas/validar'] = {
      ...RESUMEN,
      citasNuevas: 0,
      citasYaCargadas: 3,
      erroresTotal: 0,
      errores: [],
    };
    montar();
    await elegirArchivo();
    fireEvent.click(screen.getByRole('button', { name: /Revisar planilla/ }));
    const boton = (await screen.findByRole('button', {
      name: /No hay citas nuevas/,
    })) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });

  it('muestra las columnas que faltan cuando el archivo no coincide', async () => {
    respuestas['POST /api/cargas/validar'] = new ApiError(
      422,
      'Faltan columnas obligatorias: Teléfono, Hora',
      {
        faltantes: ['Teléfono', 'Hora'],
        encabezadosLeidos: ['Paciente', 'RUT'],
      },
    );
    montar();
    await elegirArchivo();
    fireEvent.click(screen.getByRole('button', { name: /Revisar planilla/ }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Teléfono, Hora');
    expect(alerta.textContent).toContain('Encabezados leídos: Paciente, RUT');
    expect(screen.getByRole('button', { name: /Revisar planilla/ })).toBeTruthy(); // sigue en el paso 1
  });

  it('un error del servidor (p. ej. archivo inválido) se muestra sin romper la pantalla', async () => {
    respuestas['POST /api/cargas/validar'] = new ApiError(
      400,
      'El archivo no es una planilla Excel (.xlsx o .xls)',
    );
    montar();
    await elegirArchivo();
    fireEvent.click(screen.getByRole('button', { name: /Revisar planilla/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('no es una planilla Excel');
  });

  it('descargar la plantilla pide el archivo a la API', async () => {
    apiBlob.mockResolvedValue(new Blob(['x']));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Descargar plantilla/ }));
    await waitFor(() => expect(apiBlob).toHaveBeenCalledWith('/api/cargas/plantilla'));
    await waitFor(() => expect(clic).toHaveBeenCalled());
  });

  it('lista las últimas cargas', async () => {
    montar();
    expect(await screen.findByText('Últimas cargas')).toBeTruthy();
    expect(await screen.findByText('CSC', { selector: 'td' })).toBeTruthy();
  });
});

describe('Asistente de carga: encargado', () => {
  beforeEach(() => {
    respuestas['GET /api/me'] = me('encargado', null);
    respuestas['GET /api/centros'] = [
      CENTRO,
      { id: 'c2', codigo: 'CSN', nombre: 'CESFAM Norte (DEMO)' },
    ];
  });

  it('debe elegir el centro antes de revisar y se envía el elegido', async () => {
    respuestas['POST /api/cargas/validar'] = RESUMEN;
    montar();
    await elegirArchivo();
    const boton = screen.getByRole('button', { name: /Revisar planilla/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    const select = await screen.findByLabelText('Centro de la planilla');
    await screen.findByRole('option', { name: 'CESFAM Norte (DEMO)' });
    fireEvent.change(select, { target: { value: 'CSN' } });
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    await screen.findByText('Vista previa');
    expect(formulario('POST', '/api/cargas/validar')!.get('centro')).toBe('CSN');
  });
});
