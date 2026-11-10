import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modulosPermitidos, type Rol } from '@bh/shared';

// --- Mocks: sin red ni Keycloak ---------------------------------------------------------------
const llamadas: { ruta: string; init?: RequestInit }[] = [];
let respuestas: Record<string, unknown> = {};

vi.mock('./api/cliente', () => ({
  ApiError: class extends Error {},
  apiFetch: vi.fn(async (ruta: string, init?: RequestInit) => {
    llamadas.push({ ruta, ...(init ? { init } : {}) });
    if (!(ruta in respuestas)) throw new Error(`Sin respuesta simulada para ${ruta}`);
    return respuestas[ruta];
  }),
}));
vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({ estado: 'autenticado', iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('./auth/auth', () => ({ userManager: {} }));

import { crearRouter } from './router';

const centro = { id: 'c1', codigo: 'CSC', nombre: 'CESFAM Centro (DEMO)' };
const me = (rol: Rol, conCentro: boolean) => ({
  id: 'u1',
  nombre: 'Usuaria Demo',
  rol,
  rolEtiqueta: rol[0]!.toUpperCase() + rol.slice(1),
  centro: conCentro ? centro : null,
  modulos: [...modulosPermitidos([rol])],
});

function montar(ruta: string) {
  const router = crearRouter({ history: createMemoryHistory({ initialEntries: [ruta] }) });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.scrollTo = vi.fn(); // jsdom no lo implementa; el router lo invoca al navegar
  llamadas.length = 0;
  respuestas = {};
});
afterEach(cleanup);

describe('Shell', () => {
  it('funcionaria: ve su centro y el aviso DEMO; el menú no incluye reportes ni configuración', async () => {
    respuestas['/api/me'] = me('funcionaria', true);
    montar('/');
    const cabecera = await screen.findByRole('banner');
    expect(within(cabecera).getByText('CESFAM Centro (DEMO)')).toBeTruthy();
    const menu = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(menu).getByText('Pendientes por llamar')).toBeTruthy();
    expect(within(menu).queryByText('Reportes')).toBeNull();
    expect(within(menu).queryByText('Configuración')).toBeNull();
    expect(screen.getByText(/Datos ficticios/)).toBeTruthy();
  });

  it('encargado sin centro asignado ve «Todos los centros»', async () => {
    respuestas['/api/me'] = me('encargado', false);
    montar('/');
    const cabecera = await screen.findByRole('banner');
    expect(within(cabecera).getByText('Todos los centros')).toBeTruthy();
    expect(within(screen.getByRole('navigation')).getByText('Reportes')).toBeTruthy();
  });

  it('muestra error y botón de cerrar sesión si la API rechaza el acceso', async () => {
    montar('/'); // sin respuesta simulada para /api/me => error
    expect(await screen.findByText('No pudimos validar tu acceso')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
  });

  it('el botón de menú contrae y expande la navegación', async () => {
    respuestas['/api/me'] = me('funcionaria', true);
    montar('/');
    const boton = await screen.findByRole('button', { name: /menú/i });
    const expandido = boton.getAttribute('aria-expanded');
    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).not.toBe(expandido);
  });
});

describe('Control de acceso en la web', () => {
  it('funcionaria que entra por URL a /configuracion ve «Sin acceso» y no se llama a la API de administración', async () => {
    respuestas['/api/me'] = me('funcionaria', true);
    montar('/configuracion');
    expect(await screen.findByText('Sin acceso')).toBeTruthy();
    expect(llamadas.some((l) => l.ruta.startsWith('/api/config'))).toBe(false);
  });

  it('un módulo pendiente de construir muestra el sprint en que llega', async () => {
    respuestas['/api/me'] = me('funcionaria', true);
    montar('/confirmaciones');
    expect(await screen.findByText(/Sprint 3/)).toBeTruthy();
  });
});

describe('Configuración (administrador)', () => {
  const motivos = [
    { id: 'm1', codigo: 'SOL_HORA', descripcion: 'Solicitud de hora', orden: 0, activo: true },
    { id: 'm2', codigo: 'FARMACIA', descripcion: 'Consulta de farmacia', orden: 1, activo: false },
  ];

  it('lista centros y motivos con su estado en texto', async () => {
    respuestas['/api/me'] = me('administrador', false);
    respuestas['/api/centros'] = [centro];
    respuestas['/api/config/motivos'] = motivos;
    montar('/configuracion');
    expect(await screen.findByText('Solicitud de hora')).toBeTruthy();
    expect(screen.getByText('Activo')).toBeTruthy();
    expect(screen.getByText('Inactivo')).toBeTruthy();
  });

  it('desactivar un motivo envía PATCH con activo=false', async () => {
    respuestas['/api/me'] = me('administrador', false);
    respuestas['/api/centros'] = [centro];
    respuestas['/api/config/motivos'] = motivos;
    respuestas['/api/config/motivos/m1'] = { ...motivos[0], activo: false };
    montar('/configuracion');
    fireEvent.click(
      await screen.findByRole('button', { name: /Desactivar el motivo Solicitud de hora/ }),
    );
    await waitFor(() => {
      const patch = llamadas.find((l) => l.ruta === '/api/config/motivos/m1');
      expect(patch?.init?.method).toBe('PATCH');
      expect(JSON.parse(String(patch?.init?.body))).toEqual({ activo: false });
    });
  });
});
