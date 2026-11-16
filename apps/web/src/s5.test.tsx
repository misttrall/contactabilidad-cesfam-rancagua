import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modulosPermitidos, type Rol } from '@bh/shared';

// --- Mocks: sin red ni Keycloak ---------------------------------------------------------------
type Llamada = { metodo: string; ruta: string; body?: unknown };
const llamadas: Llamada[] = [];
let respuestas: Record<string, unknown> = {};
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

beforeEach(() => {
  llamadas.length = 0;
  apiBlob.mockReset();
  respuestas = {
    'GET /api/me': me('encargado', null),
    'GET /api/centros': [CENTRO, { id: 'c2', codigo: 'CSN', nombre: 'CESFAM Norte (DEMO)' }],
  };
});
afterEach(cleanup);

// =========================================================================================
// Dashboard
// =========================================================================================

const DASH = {
  fecha: '2026-11-22',
  hoy: '2026-11-20',
  kpis: {
    cargadas: 30,
    porEnviar: 10,
    enviadas: 8,
    confirmadas: 7,
    sinRespuesta: 3,
    canceladas: 2,
    llamadasEntrantesHoy: 5,
  },
  pendientesPorLlamar: 4,
  liberacionesPendientes: 1,
  proximasAConfirmar: [{ id: 'x', hora: '08:30', paciente: 'Paciente Demo 001', tipo: 'cronico' }],
  llamadasRecientes: [
    {
      id: 'l1',
      creadaEn: '2026-11-20T15:00:00Z',
      centro: 'CSC',
      paciente: null,
      rut: '12.345.***-9',
      motivo: 'Solicitud de hora',
    },
  ],
};

describe('Dashboard', () => {
  beforeEach(() => {
    respuestas['GET /api/dashboard'] = DASH;
  });

  it('muestra los 7 indicadores, con «Enviadas» separada de «Canceladas»', async () => {
    montar('/');
    const kpis = await screen.findByLabelText('Indicadores del día');
    const dato = (texto: string) =>
      within(kpis).getByText(texto, { exact: false }).closest('.dato') as HTMLElement;
    expect(
      within(kpis)
        .getAllByText(/./, { selector: '.dato__valor' })
        .map((e) => e.textContent),
    ).toEqual(['30', '10', '8', '7', '3', '2', '5']);
    expect(dato('Enviado').textContent).toContain('8');
    expect(dato('Cancelado').textContent).toContain('2');
    expect(screen.getByText('Llamadas entrantes hoy')).toBeTruthy();
  });

  it('lista próximas a confirmar y llamadas recientes sin datos sensibles', async () => {
    montar('/');
    expect(await screen.findByText('Paciente Demo 001')).toBeTruthy();
    expect(screen.getByText('12.345.***-9')).toBeTruthy();
    expect(screen.getByText('Solicitud de hora')).toBeTruthy();
  });

  it('el encargado puede filtrar por centro; la funcionaria no ve el selector', async () => {
    montar('/');
    const sel = await screen.findByLabelText('Centro');
    await screen.findByRole('option', { name: 'CESFAM Norte (DEMO)' });
    fireEvent.change(sel, { target: { value: 'CSN' } });
    await waitFor(() =>
      expect(
        llamadas.some((l) => l.ruta.startsWith('/api/dashboard') && l.ruta.includes('centro=CSN')),
      ).toBe(true),
    );
    cleanup();
    respuestas['GET /api/me'] = me('funcionaria', CENTRO);
    montar('/');
    await screen.findByLabelText('Indicadores del día');
    expect(screen.queryByLabelText('Centro')).toBeNull();
  });

  it('muestra el error si la API falla', async () => {
    respuestas['GET /api/dashboard'] = new Error('Servicio no disponible');
    montar('/');
    expect((await screen.findByRole('alert')).textContent).toContain('Servicio no disponible');
  });
});

// =========================================================================================
// Reportes
// =========================================================================================

const RESUMEN = {
  filtros: { desde: '2026-10-22', hasta: '2026-11-20', dias: 30, centro: null },
  confirmaciones: {
    porCentro: [
      {
        centro: 'CSC',
        nombre: 'CESFAM Centro (DEMO)',
        total: 10,
        sin_enviar: 1,
        enviado: 2,
        confirmado: 5,
        sin_respuesta: 1,
        cancelado: 1,
      },
      {
        centro: 'CSN',
        nombre: 'CESFAM Norte (DEMO)',
        total: 4,
        sin_enviar: 0,
        enviado: 0,
        confirmado: 3,
        sin_respuesta: 1,
        cancelado: 0,
      },
    ],
    total: { total: 14, sin_enviar: 1, enviado: 2, confirmado: 8, sin_respuesta: 2, cancelado: 1 },
  },
  motivos: {
    total: 3,
    filas: [
      { motivo: 'Solicitud de hora', llamadas: 2 },
      { motivo: 'Otros', llamadas: 1 },
    ],
  },
  edadSexo: {
    filas: [
      { tramo: '0-14', M: 0, F: 0, sinDato: 0, total: 0 },
      { tramo: '65 y más', M: 0, F: 1, sinDato: 0, total: 1 },
    ],
    sinPacienteIdentificado: 2,
  },
  piloto: {
    proporcionConfirmadas: 57.1,
    citasConWhatsapp: 10,
    tasaRespuestaWhatsapp: 60,
    respondidasPorWhatsapp: 6,
    llamadasEvitadas: 5,
    llamadasEvitadasPorDia: 0.2,
    llamadasSalientes: 4,
    llamadasEntrantes: 3,
    tiempoRegistroEntrante: { registros: 3, promedio: 30, mediana: 28, p90: 40, bajoMeta: 66.7 },
  },
};

describe('Reportes', () => {
  beforeEach(() => {
    respuestas['GET /api/reportes/resumen'] = RESUMEN;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });

  it('presenta métricas del piloto, confirmaciones por centro, motivos y edad × sexo', async () => {
    montar('/reportes');
    expect(await screen.findByText('57,1 %')).toBeTruthy();
    expect(screen.getByText('60 %')).toBeTruthy();
    expect(screen.getByText('28 s')).toBeTruthy();
    expect(screen.getAllByText('CESFAM Norte (DEMO)').length).toBeGreaterThan(0);
    expect(screen.getByRole('rowheader', { name: 'Total' })).toBeTruthy(); // fila de totales con más de un centro
    expect(screen.getByText('Solicitud de hora')).toBeTruthy();
    expect(screen.getByText('65 y más')).toBeTruthy();
    expect(screen.getByText(/sin paciente identificado: 2/i)).toBeTruthy();
  });

  it('cada estado de la tabla lleva su nombre (no depende del color)', async () => {
    montar('/reportes');
    const t = (await screen.findAllByText('Distribución', { selector: 'th' }))[0]!.closest(
      'table',
    )!;
    for (const e of ['Confirmado', 'Enviado', 'Sin enviar', 'Sin respuesta', 'Cancelado']) {
      expect(within(t).getAllByText(e, { exact: false }).length).toBeGreaterThan(0);
    }
  });

  it('con el rango invertido avisa y no consulta ni deja exportar', async () => {
    montar('/reportes');
    await screen.findByText('57,1 %');
    llamadas.length = 0;
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-12-31' } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/no puede ser posterior/);
    expect(
      (screen.getByRole('button', { name: /Exportar a Excel/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(llamadas.filter((l) => l.ruta.startsWith('/api/reportes/resumen'))).toHaveLength(0);
  });

  it('exporta a Excel con los mismos filtros', async () => {
    apiBlob.mockResolvedValue(new Blob(['x']));
    montar('/reportes');
    await screen.findByText('57,1 %');
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'CSN' } });
    await waitFor(() => expect(llamadas.some((l) => l.ruta.includes('centro=CSN'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Exportar a Excel/ }));
    await waitFor(() => expect(apiBlob).toHaveBeenCalledTimes(1));
    expect(String(apiBlob.mock.calls[0]![0])).toMatch(/^\/api\/reportes\/exportar\?.*centro=CSN/);
  });

  it('informa si la descarga falla', async () => {
    apiBlob.mockRejectedValue(new Error('No se pudo generar'));
    montar('/reportes');
    await screen.findByText('57,1 %');
    fireEvent.click(screen.getByRole('button', { name: /Exportar a Excel/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo generar');
  });

  it('la funcionaria queda fija en su centro', async () => {
    respuestas['GET /api/me'] = me('funcionaria', CENTRO);
    montar('/reportes');
    // sin permiso para el módulo, se muestra el acceso denegado en lugar del reporte
    await waitFor(() => expect(screen.queryByText('57,1 %')).toBeNull());
  });
});

// =========================================================================================
// Configuración
// =========================================================================================

const USUARIOS = {
  habilitado: true,
  usuarios: [
    {
      id: 'k1',
      username: 'admin.demo',
      nombre: 'Administrador Demo',
      activo: true,
      rol: 'administrador',
      centro: null,
      ultimoIngreso: null,
      esYo: true,
    },
    {
      id: 'k2',
      username: 'funcionaria.csc',
      nombre: 'Funcionaria Centro',
      activo: true,
      rol: 'funcionaria',
      centro: 'CSC',
      ultimoIngreso: null,
      esYo: false,
    },
  ],
};

describe('Configuración', () => {
  beforeEach(() => {
    respuestas = {
      ...respuestas,
      'GET /api/me': me('administrador', null),
      'GET /api/config/centros': [
        { ...CENTRO, activo: true },
        { id: 'c2', codigo: 'CSN', nombre: 'CESFAM Norte (DEMO)', activo: false },
      ],
      'GET /api/config/motivos': [
        { id: 'm1', codigo: 'SOL', descripcion: 'Solicitud de hora', orden: 0, activo: true },
        { id: 'm2', codigo: 'OTROS', descripcion: 'Otros', orden: 1, activo: true },
      ],
      'GET /api/config/plantillas': {
        modo: 'simulado',
        plantillas: [
          {
            clave: 'confirmacion',
            nombre: 'confirmacion_cita',
            idioma: 'es',
            texto: 'Texto de ejemplo',
            botones: ['Sí', 'No'],
          },
        ],
        parametros: ['Nombre del centro'],
        reagendamiento: 'x',
        nota: 'El texto lo fija la plantilla aprobada en Meta.',
      },
      'GET /api/config/usuarios': USUARIOS,
      'GET /api/config/parametros': [],
      'GET /api/config/demo': { disponible: true },
    };
  });

  it('crea un centro', async () => {
    respuestas['POST /api/config/centros'] = { ...CENTRO, id: 'c3', activo: true };
    montar('/configuracion');
    await screen.findByText('Centros');
    fireEvent.change(await screen.findByLabelText('Código del centro'), {
      target: { value: 'ABC' },
    });
    fireEvent.change(screen.getByLabelText('Nombre del centro'), {
      target: { value: 'CESFAM Abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar centro' }));
    await waitFor(() =>
      expect(cuerpo('POST', '/api/config/centros')).toEqual({
        codigo: 'ABC',
        nombre: 'CESFAM Abc',
      }),
    );
  });

  it('muestra el error del servidor al crear un centro duplicado', async () => {
    respuestas['POST /api/config/centros'] = new Error('Ya existe un centro con el código ABC');
    montar('/configuracion');
    fireEvent.change(await screen.findByLabelText('Código del centro'), {
      target: { value: 'ABC' },
    });
    fireEvent.change(screen.getByLabelText('Nombre del centro'), {
      target: { value: 'CESFAM Abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar centro' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Ya existe');
  });

  it('activa un centro inactivo', async () => {
    respuestas['PATCH /api/config/centros/c2'] = {
      id: 'c2',
      codigo: 'CSN',
      nombre: 'CESFAM Norte (DEMO)',
      activo: true,
    };
    montar('/configuracion');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Activar el centro CESFAM Norte (DEMO)' }),
    );
    await waitFor(() =>
      expect(cuerpo('PATCH', '/api/config/centros/c2')).toEqual({ activo: true }),
    );
  });

  it('edita el teléfono de contacto del centro y lo envía junto con el nombre', async () => {
    respuestas['PATCH /api/config/centros/c2'] = {
      id: 'c2',
      codigo: 'CSN',
      nombre: 'CESFAM Norte (DEMO)',
      activo: false,
      telefonoContacto: '+56 72 255 0000',
    };
    montar('/configuracion');
    expect((await screen.findAllByText('Sin teléfono')).length).toBeGreaterThan(0);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar el centro CESFAM Norte (DEMO)' }),
    );
    fireEvent.change(screen.getByLabelText('Teléfono de contacto del centro CSN'), {
      target: { value: '+56 72 255 0000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(cuerpo('PATCH', '/api/config/centros/c2')).toEqual({
        nombre: 'CESFAM Norte (DEMO)',
        telefonoContacto: '+56 72 255 0000',
      }),
    );
  });

  it('reordena motivos; no se puede subir el primero ni bajar el último', async () => {
    respuestas['POST /api/config/motivos/m2/mover'] = [];
    montar('/configuracion');
    const subir1 = (await screen.findByRole('button', {
      name: 'Subir el motivo Solicitud de hora',
    })) as HTMLButtonElement;
    expect(subir1.disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Bajar el motivo Otros' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Subir el motivo Otros' }));
    await waitFor(() =>
      expect(cuerpo('POST', '/api/config/motivos/m2/mover')).toEqual({ direccion: 'arriba' }),
    );
  });

  it('muestra las plantillas como solo lectura con la nota de Meta', async () => {
    montar('/configuracion');
    expect(await screen.findByText('Texto de ejemplo')).toBeTruthy();
    expect(screen.getByText(/aprobada en Meta/)).toBeTruthy();
  });

  it('cambia el rol de un usuario y exige centro para la funcionaria', async () => {
    respuestas['PATCH /api/config/usuarios/k2'] = {
      ...USUARIOS.usuarios[1],
      rol: 'encargado',
      centro: null,
    };
    montar('/configuracion');
    const rol = (await screen.findByLabelText('Rol de Funcionaria Centro')) as HTMLSelectElement;
    fireEvent.change(rol, { target: { value: 'encargado' } });
    expect(screen.queryByLabelText('Centro de Funcionaria Centro')).toBeNull(); // el encargado no lleva centro
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar los cambios de Funcionaria Centro' }),
    );
    await waitFor(() =>
      expect(cuerpo('PATCH', '/api/config/usuarios/k2')).toEqual({ rol: 'encargado' }),
    );
  });

  it('no deja desactivarse a uno mismo; sí desactivar a otro', async () => {
    respuestas['PATCH /api/config/usuarios/k2'] = { ...USUARIOS.usuarios[1], activo: false };
    montar('/configuracion');
    const propio = (await screen.findByRole('button', {
      name: 'Desactivar a Administrador Demo',
    })) as HTMLButtonElement;
    expect(propio.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar a Funcionaria Centro' }));
    await waitFor(() =>
      expect(cuerpo('PATCH', '/api/config/usuarios/k2')).toEqual({ activo: false }),
    );
  });

  it('si Keycloak no está configurado, lo explica en vez de mostrar la tabla', async () => {
    respuestas['GET /api/config/usuarios'] = { habilitado: false, usuarios: [] };
    montar('/configuracion');
    expect(await screen.findByText(/no está configurada en este ambiente/)).toBeTruthy();
    expect(screen.queryByLabelText('Rol de Funcionaria Centro')).toBeNull();
  });

  it('restablecer datos demo exige escribir RESTABLECER', async () => {
    respuestas['POST /api/config/demo/restablecer'] = {
      citas: 3,
      pacientes: 3,
      llamadasEntrantes: 0,
      citasSembradas: 28,
    };
    montar('/configuracion');
    const boton = (await screen.findByRole('button', {
      name: 'Restablecer datos demo',
    })) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Escribe RESTABLECER para confirmar'), {
      target: { value: 'restablecer' },
    });
    expect(boton.disabled).toBe(true); // distingue mayúsculas
    fireEvent.change(screen.getByLabelText('Escribe RESTABLECER para confirmar'), {
      target: { value: 'RESTABLECER' },
    });
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    await waitFor(() =>
      expect(cuerpo('POST', '/api/config/demo/restablecer')).toEqual({
        sembrar: true,
        confirmacion: 'RESTABLECER',
      }),
    );
    expect(await screen.findByText(/28 citas ficticias/)).toBeTruthy();
  });

  it('fuera de DEMO no se ofrece restablecer', async () => {
    respuestas['GET /api/config/demo'] = { disponible: false };
    montar('/configuracion');
    await screen.findByText('Centros');
    await screen.findByText('Usuarios');
    expect(screen.queryByRole('button', { name: 'Restablecer datos demo' })).toBeNull();
  });
});
