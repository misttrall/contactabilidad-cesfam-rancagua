/**
 * Matriz de permisos por rol y alcance por centro (informe, tabla 8).
 * Lógica pura: la usan la API (guards) y la web (menú) para que ambas decidan igual.
 * La API es la fuente de verdad; la web solo oculta lo que la API igual rechazaría.
 */
export const ROLES = ['funcionaria', 'encargado', 'administrador'] as const;
export type Rol = (typeof ROLES)[number];

export const MODULOS = [
  'dashboard',
  'cargar_citas',
  'confirmacion_masiva',
  'pendientes',
  'llamada_entrante',
  'historial',
  'reportes',
  'configuracion',
] as const;
export type Modulo = (typeof MODULOS)[number];

const PERMISOS: Record<Rol, readonly Modulo[]> = {
  funcionaria: [
    'dashboard',
    'cargar_citas',
    'confirmacion_masiva',
    'pendientes',
    'llamada_entrante',
    'historial',
  ],
  encargado: [
    'dashboard',
    'cargar_citas',
    'confirmacion_masiva',
    'pendientes',
    'llamada_entrante',
    'historial',
    'reportes',
  ],
  administrador: MODULOS,
};

export const ETIQUETA_ROL: Record<Rol, string> = {
  funcionaria: 'Funcionaria',
  encargado: 'Encargado',
  administrador: 'Administrador',
};

export const ETIQUETA_MODULO: Record<Modulo, string> = {
  dashboard: 'Inicio',
  cargar_citas: 'Cargar planilla AVIS',
  confirmacion_masiva: 'Confirmación masiva',
  pendientes: 'Pendientes por llamar',
  llamada_entrante: 'Llamada entrante',
  historial: 'Historial de llamadas',
  reportes: 'Reportes',
  configuracion: 'Configuración',
};

export interface SesionUsuario {
  /** Identificador estable del usuario en Keycloak (claim `sub`). */
  id: string;
  nombre: string;
  roles: readonly string[];
  /** Código del centro asignado (claim `centro_id`); ausente = sin centro. */
  centroId?: string | undefined;
}

const PRIORIDAD: readonly Rol[] = ['administrador', 'encargado', 'funcionaria'];

/** Rol de mayor jerarquía entre los roles del token, ignorando los que no son del sistema. */
export function rolPrincipal(roles: readonly string[]): Rol | null {
  return PRIORIDAD.find((r) => roles.includes(r)) ?? null;
}

export function puedeAcceder(roles: readonly string[], modulo: Modulo): boolean {
  const rol = rolPrincipal(roles);
  return rol !== null && PERMISOS[rol].includes(modulo);
}

export function modulosPermitidos(roles: readonly string[]): readonly Modulo[] {
  const rol = rolPrincipal(roles);
  return rol === null ? [] : PERMISOS[rol];
}

export type Alcance =
  { tipo: 'todos' } | { tipo: 'centro'; centroId: string } | { tipo: 'prohibido'; motivo: string };

/**
 * Alcance de datos de un usuario.
 * - administrador/encargado: todos los centros (pueden acotar con `centroSolicitado`).
 * - funcionaria: SOLO su centro; si pide otro, se prohíbe (no se filtra en silencio).
 * - funcionaria sin centro asignado: prohibido. Esto corrige la RN-13 del prototipo
 *   ("sin centro = Todos"), que sería una fuga de datos para una funcionaria mal configurada.
 */
export function resolverAlcance(s: SesionUsuario, centroSolicitado?: string): Alcance {
  const rol = rolPrincipal(s.roles);
  if (rol === null) return { tipo: 'prohibido', motivo: 'Sin rol del sistema' };
  if (rol === 'funcionaria') {
    if (!s.centroId) return { tipo: 'prohibido', motivo: 'Funcionaria sin centro asignado' };
    if (centroSolicitado && centroSolicitado !== s.centroId) {
      return { tipo: 'prohibido', motivo: 'Solo puede acceder a datos de su centro' };
    }
    return { tipo: 'centro', centroId: s.centroId };
  }
  return centroSolicitado ? { tipo: 'centro', centroId: centroSolicitado } : { tipo: 'todos' };
}
