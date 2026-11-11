/**
 * Límites por defecto (ventana de 1 minuto). Holgados para el uso normal (≈150 contactos por
 * funcionaria al día) y cerrados para abuso o extracción masiva.
 */
export const LIMITES = {
  /** Por usuario autenticado. */
  general: { ventanaMs: 60_000, max: 600 },
  /** Por IP, antes de autenticar: solo frena inundaciones. Alto porque un Cesfam comparte IP. */
  ip: { ventanaMs: 60_000, max: 3_000 },
  /** Cargas de planilla: operación pesada (por usuario). */
  cargas: { ventanaMs: 60_000, max: 10 },
  /** Revelar RUT/teléfono: dato sensible (por usuario). */
  revelar: { ventanaMs: 60_000, max: 60 },
  /** Envíos masivos y simulación (por usuario). */
  envios: { ventanaMs: 60_000, max: 20 },
  /** Exportación de reportes (por usuario). */
  exportar: { ventanaMs: 60_000, max: 10 },
  /** Webhook de Meta: ráfagas grandes; por IP, con holgura. */
  webhook: { ventanaMs: 60_000, max: 3_000 },
} as const;

export type NombreLimite = keyof typeof LIMITES;
