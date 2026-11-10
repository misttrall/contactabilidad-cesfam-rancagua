import { z } from 'zod';
import { ESTADOS_CITA, RESULTADOS_LLAMADA } from './estados';
import { normalizarRut } from './rut';

export const rutSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizarRut(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'RUT no válido: revisa el dígito verificador' });
      return z.NEVER;
    }
    return n;
  });

/** Celular chileno: se normaliza a +569XXXXXXXX. */
export const telefonoSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const d = v.replace(/[\s()-]/g, '').replace(/^\+?56/, '');
    if (!/^9\d{8}$/.test(d)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Teléfono no válido: debe ser celular +56 9 XXXX XXXX',
      });
      return z.NEVER;
    }
    return `+56${d}`;
  });

export const tipoCitaSchema = z.enum(['cronico', 'morbilidad']);
export const estadoCitaSchema = z.enum(ESTADOS_CITA);
export const resultadoLlamadaSchema = z.enum(RESULTADOS_LLAMADA);

/** Fila de la planilla AVIS ya mapeada a nuestras columnas (informe 7.7). */
export const filaPlanillaSchema = z.object({
  paciente: z.string().trim().min(2, 'Falta el nombre del paciente'),
  rut: rutSchema,
  telefono: telefonoSchema,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato AAAA-MM-DD'),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora con formato HH:mm'),
  profesional: z.string().trim().min(2, 'Falta el profesional'),
  prestacion: z.string().trim().min(2, 'Falta la prestación'),
  tipo: tipoCitaSchema,
});
export type FilaPlanilla = z.infer<typeof filaPlanillaSchema>;

export const registroLlamadaEntranteSchema = z
  .object({
    rut: rutSchema,
    centroId: z.string().min(1, 'Selecciona el centro'),
    motivoId: z.string().min(1, 'Selecciona el motivo'),
    esOtros: z.boolean().default(false),
    otroMotivo: z.string().trim().max(200).optional(),
    observacion: z.string().trim().max(500).optional(),
  })
  .refine((d) => !d.esOtros || (d.otroMotivo && d.otroMotivo.length > 0), {
    path: ['otroMotivo'],
    message: 'Especifica el motivo cuando eliges "Otros"',
  });
