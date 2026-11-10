import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
} from '@tanstack/react-router';
import type { Modulo } from '@bh/shared';
import { config } from './config';
import { Shell } from './Shell';
import { Configuracion } from './paginas/Configuracion';
import { ConAcceso } from './paginas/ConAcceso';
import { Diseno } from './paginas/Diseno';
import { EnConstruccion } from './paginas/EnConstruccion';
import { Inicio } from './paginas/Inicio';

const raiz = createRootRoute({ component: Shell });

const protegida = (path: string, modulo: Modulo, pagina: () => React.ReactElement) =>
  createRoute({
    getParentRoute: () => raiz,
    path,
    component: () => <ConAcceso modulo={modulo}>{pagina()}</ConAcceso>,
  });

const rutas = [
  protegida('/', 'dashboard', () => <Inicio />),
  protegida('/cargas', 'cargar_citas', () => <EnConstruccion modulo="cargar_citas" />),
  protegida('/confirmaciones', 'confirmacion_masiva', () => (
    <EnConstruccion modulo="confirmacion_masiva" />
  )),
  protegida('/pendientes', 'pendientes', () => <EnConstruccion modulo="pendientes" />),
  protegida('/llamadas/nueva', 'llamada_entrante', () => (
    <EnConstruccion modulo="llamada_entrante" />
  )),
  protegida('/llamadas', 'historial', () => <EnConstruccion modulo="historial" />),
  protegida('/reportes', 'reportes', () => <EnConstruccion modulo="reportes" />),
  protegida('/configuracion', 'configuracion', () => <Configuracion />),
  // El catálogo de diseño no existe en producción.
  ...(config.ambiente !== 'PRODUCCION'
    ? [createRoute({ getParentRoute: () => raiz, path: '/diseno', component: Diseno })]
    : []),
];

export const arbolDeRutas = raiz.addChildren(rutas);

/** Se crea DESPUÉS de resolver la sesión para que lea la URL ya limpia del callback OIDC. */
export function crearRouter(opciones: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree: arbolDeRutas,
    ...(opciones.history ? { history: opciones.history } : {}),
    defaultNotFoundComponent: () => (
      <section className="pagina">
        <h1>Página no encontrada</h1>
        <p className="texto-secundario">Usa el menú de la izquierda para volver al trabajo.</p>
      </section>
    ),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof crearRouter>;
  }
}

export { Outlet };
