import { z } from 'zod';
import { rutSchema, resultadoLlamadaSchema } from './schemas';
import type { ResultadoLlamada } from './estados';

/** Código del motivo «Otros», que exige un detalle. */
export const MOTIVO_OTROS = 'OTROS';
export const MAX_OBSERVACION = 500;

export const ETIQUETA_RESULTADO: Record<ResultadoLlamada, string> = {
  confirmado: 'Confirmado (asistirá)',
  recado: 'Recado dejado',
  no_ubicado: 'No ubicado',
  cancelado: 'Cancelado por el paciente',
};

/** Texto de apoyo de cada resultado en la pantalla de llamadas. */
export const AYUDA_RESULTADO: Record<ResultadoLlamada, string> = {
  confirmado: 'El paciente asistirá a su hora.',
  recado: 'Se dejó mensaje. La cita sigue vigente y queda en la lista para volver a llamar.',
  no_ubicado: 'No contestó o el número no corresponde. La cita sigue vigente y queda en la lista.',
  cancelado: 'El paciente no asistirá. Hay que liberar la hora en AVIS.',
};

const observacion = z
  .string()
  .trim()
  .max(MAX_OBSERVACION, `Máximo ${MAX_OBSERVACION} caracteres`)
  .optional()
  .transform((v) => (v === '' ? undefined : v));

/** Resultado de una llamada SALIENTE (a un paciente pendiente). */
export const resultadoSalienteSchema = z
  .object({ resultado: resultadoLlamadaSchema, observacion })
  .strict();
export type ResultadoSaliente = z.infer<typeof resultadoSalienteSchema>;

/** Registro de una llamada ENTRANTE. El servidor decide si el motivo es «Otros» por su código. */
export const registroEntranteSchema = z
  .object({
    rut: rutSchema,
    centro: z.string().trim().min(1).optional(),
    motivoId: z.string().uuid('Selecciona el motivo'),
    otroMotivo: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
    observacion,
    /** Segundos entre abrir el formulario y registrar (métrica del piloto: meta < 30 s). */
    segundos: z.number().int().min(0).max(3600).optional(),
  })
  .strict();
export type RegistroEntrante = z.infer<typeof registroEntranteSchema>;

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato AAAA-MM-DD');

/** Filtros del historial de llamadas entrantes (paginación en el servidor). */
export const filtrosHistorialSchema = z.object({
  centro: z.string().trim().min(1).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  motivoId: z.string().uuid().optional(),
  /** RUT válido (búsqueda exacta) o parte del nombre del paciente. */
  q: z.string().trim().min(2).max(80).optional(),
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  tam: z.coerce.number().int().min(1).max(100).default(25),
});
export type FiltrosHistorial = z.infer<typeof filtrosHistorialSchema>;
