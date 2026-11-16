import { z } from 'zod';
import { instanteSantiago } from './fechas';
import { normalizarTexto } from './planilla';

/**
 * Lógica pura de la confirmación por WhatsApp (S3): ventana horaria, textos de las plantillas,
 * interpretación de respuestas y parámetros de operación.
 *
 * PRIVACIDAD: los mensajes NO llevan nombre del paciente, profesional ni prestación (que podría
 * revelar un diagnóstico, p. ej. «Control DM2»). Solo el centro, la fecha y la hora.
 */

// ------------------------------------------------------------------------------------ horario

export interface VentanaHoraria {
  /** HH:mm (hora de Chile) */
  desde: string;
  hasta: string;
}

/** Fecha (AAAA-MM-DD) y minutos desde medianoche en America/Santiago. */
export function partesSantiago(d: Date): { fecha: string; minutos: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '0';
  return {
    fecha: `${v('year')}-${v('month')}-${v('day')}`,
    minutos: Number(v('hour')) * 60 + Number(v('minute')),
  };
}

const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

export function dentroDeVentana(ahora: Date, v: VentanaHoraria): boolean {
  const { minutos } = partesSantiago(ahora);
  return minutos >= aMinutos(v.desde) && minutos < aMinutos(v.hasta);
}

function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Si `ahora` está dentro de la ventana devuelve `ahora`; si no, el próximo inicio de ventana. */
export function proximoInstanteEnVentana(ahora: Date, v: VentanaHoraria): Date {
  if (dentroDeVentana(ahora, v)) return ahora;
  const { fecha, minutos } = partesSantiago(ahora);
  const dia = minutos < aMinutos(v.desde) ? fecha : sumarDias(fecha, 1);
  return new Date(instanteSantiago(dia, v.desde));
}

// ------------------------------------------------------------------------------------ textos

/** «miércoles 25 de noviembre». */
export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
    .format(new Date(Date.UTC(a, m - 1, d)))
    .replace(',', '');
}

export const BOTON_SI = 'Sí, asistiré';
export const BOTON_NO = 'No podré asistir';

export interface DatosMensajeCita {
  centro: string;
  /** AAAA-MM-DD */
  fecha: string;
  /** HH:mm */
  hora: string;
}

/** Plantillas aprobadas en Meta (nombre configurable por entorno). Cada una lleva 3 parámetros. */
export const PLANTILLAS = {
  confirmacion: { nombre: 'confirmacion_hora_v1', idioma: 'es' },
  recordatorio: { nombre: 'recordatorio_hora_v1', idioma: 'es' },
} as const;

export function parametrosPlantilla(d: DatosMensajeCita): [string, string, string] {
  return [d.centro, fechaLarga(d.fecha), d.hora];
}

export function textoConfirmacion(d: DatosMensajeCita): string {
  const [centro, fecha, hora] = parametrosPlantilla(d);
  return `Recordatorio de ${centro}: tiene una hora de control el ${fecha} a las ${hora}. ¿Asistirá?`;
}

export function textoRecordatorio(d: DatosMensajeCita): string {
  const [centro, fecha, hora] = parametrosPlantilla(d);
  return `Le recordamos su hora de control en ${centro} el ${fecha} a las ${hora}. Aún no recibimos su respuesta: ¿asistirá?`;
}

/**
 * Respuesta al «No». Hay UN solo número de WhatsApp para todos los Cesfam: el teléfono para
 * reagendar y atender su requerimiento es el del Cesfam del paciente (si está configurado).
 */
export function textoReagendamiento(info: string, telefonoCentro?: string | null): string {
  const base = `Gracias por avisar. Registramos que no podrá asistir. ${info}`;
  const tel = telefonoCentro?.trim();
  return tel ? `${base} Para reagendar o atender su requerimiento, llame al ${tel}.` : base;
}

export const TEXTO_BAJA =
  'Listo: no le enviaremos más mensajes por WhatsApp. Si tiene una hora pendiente, podríamos llamarle por teléfono.';

// ------------------------------------------------------------------------------------ respuestas

export type AccionRespuesta = 'SI' | 'NO' | 'BAJA';

/** Cada botón lleva el id del mensaje: la respuesta se asocia sin ambigüedad a su cita. */
export function payloadBoton(accion: AccionRespuesta, mensajeId: string): string {
  return `${accion}:${mensajeId}`;
}

export function parsearPayloadBoton(
  payload: string,
): { accion: AccionRespuesta; mensajeId: string } | null {
  const m = /^(SI|NO|BAJA):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
    payload,
  );
  return m ? { accion: m[1] as AccionRespuesta, mensajeId: m[2]!.toLowerCase() } : null;
}

/**
 * Texto libre del paciente. Prudente: ante la duda devuelve null (la funcionaria llamará).
 * La baja tiene prioridad: «no quiero recibir más mensajes» NO es un «no» a la cita.
 */
export function interpretarTexto(texto: string): 'si' | 'no' | 'baja' | null {
  const t = normalizarTexto(texto);
  if (!t) return null;
  if (/\b(baja|stop|no deseo recibir|no quiero recibir|dejar de recibir)\b/.test(t)) return 'baja';
  if (
    ['si', 's', 'sii', 'confirmo', 'asistire', 'ok', 'si asistire', 'si voy', 'voy'].includes(t)
  ) {
    return 'si';
  }
  if (
    [
      'no',
      'n',
      'noo',
      'no puedo',
      'no podre',
      'no asistire',
      'no voy',
      'no podre asistir',
    ].includes(t)
  ) {
    return 'no';
  }
  return null;
}

// ------------------------------------------------------------------------------------ parámetros

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora con formato HH:mm');

export const ventanaSchema = z
  .object({ desde: hhmm, hasta: hhmm })
  .strict()
  .refine((v) => v.desde < v.hasta, { message: 'La hora de inicio debe ser anterior al término' });

export const PARAMETROS = {
  'envio.anticipacion_horas': {
    schema: z.number().int().min(1).max(720),
    // El Cesfam confirma las horas del día siguiente.
    porDefecto: 24 as number,
    descripcion: 'Horas de anticipación con que se envía la confirmación',
  },
  'envio.ventana_horaria': {
    schema: ventanaSchema,
    porDefecto: { desde: '09:00', hasta: '18:00' } as VentanaHoraria,
    descripcion: 'Horario (Chile) dentro del cual se envían mensajes',
  },
  'envio.horas_espera_respuesta': {
    schema: z.number().int().min(1).max(168),
    porDefecto: 24 as number,
    descripcion: 'Horas de espera antes de pasar la cita a «Sin respuesta»',
  },
  'envio.segundo_mensaje_adulto_mayor': {
    schema: z.boolean(),
    porDefecto: true as boolean,
    descripcion: 'Enviar un segundo recordatorio a mayores de 65 sin respuesta',
  },
  'envio.limite_por_segundo': {
    schema: z.number().int().min(1).max(80),
    porDefecto: 10 as number,
    descripcion: 'Máximo de mensajes por segundo hacia WhatsApp',
  },
  'carga.excluir_morbilidad_por_defecto': {
    schema: z.boolean(),
    porDefecto: true as boolean,
    descripcion: 'Excluir la morbilidad al cargar planillas',
  },
  'mensajes.reagendamiento_info': {
    schema: z.string().trim().min(5).max(300),
    porDefecto: 'Puede reagendar su hora comunicándose con su Cesfam.' as string,
    descripcion: 'Texto de ayuda para reagendar cuando el paciente responde «No»',
  },
} as const;

export type ClaveParametro = keyof typeof PARAMETROS;
export const CLAVES_PARAMETRO = Object.keys(PARAMETROS) as ClaveParametro[];

export function esClaveParametro(c: string): c is ClaveParametro {
  return c in PARAMETROS;
}

/** Valida el valor de un parámetro; devuelve el valor normalizado o los mensajes de error. */
export function validarParametro(
  clave: string,
  valor: unknown,
): { ok: true; valor: unknown } | { ok: false; error: string } {
  if (!esClaveParametro(clave)) return { ok: false, error: `Parámetro desconocido: ${clave}` };
  const r = PARAMETROS[clave].schema.safeParse(valor);
  return r.success
    ? { ok: true, valor: r.data }
    : { ok: false, error: r.error.issues.map((i) => i.message).join('; ') };
}
