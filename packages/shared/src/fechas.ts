/**
 * Normalización de fechas y horas que vienen de Excel (números serie, textos dd-mm-aaaa, etc.).
 * Todo es aritmética en UTC o texto: nunca depende de la zona horaria del servidor.
 */

const MS_DIA = 86_400_000;
const EPOCA_EXCEL = Date.UTC(1899, 11, 30); // serie 0 de Excel (válido desde 1900-03-01)

function esFechaReal(a: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Número serie de Excel -> AAAA-MM-DD. Rango plausible: años 1950-2100. */
export function serialExcelAFecha(serie: number): string | null {
  if (!Number.isFinite(serie) || serie < 18_000 || serie > 73_000) return null;
  const d = new Date(EPOCA_EXCEL + Math.floor(serie) * MS_DIA);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Fracción de día de Excel (0..1) -> HH:mm. */
export function fraccionAHora(fraccion: number): string | null {
  if (!Number.isFinite(fraccion) || fraccion < 0) return null;
  const minutos = Math.round((fraccion - Math.floor(fraccion)) * 1440);
  if (minutos >= 1440) return '00:00';
  return `${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}`;
}

/** Acepta serie Excel, AAAA-MM-DD, DD-MM-AAAA, DD/MM/AAAA y DD.MM.AAAA (con o sin hora al final). */
export function normalizarFecha(v: unknown): string | null {
  if (typeof v === 'number') return serialExcelAFecha(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return fechaOk(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s.*)?$/.exec(s);
  if (m) return fechaOk(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function fechaOk(a: number, m: number, d: number): string | null {
  return esFechaReal(a, m, d) && a >= 1900 && a <= 2100 ? `${a}-${pad(m)}-${pad(d)}` : null;
}

/** Acepta fracción Excel, "9:30", "09:30" y "09:30:00". */
export function normalizarHora(v: unknown): string | null {
  if (typeof v === 'number') return fraccionAHora(v);
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  return h <= 23 ? `${pad(h)}:${m[2]}` : null;
}

/** Edad cumplida a una fecha de referencia (ambas AAAA-MM-DD). */
export function edadCumplida(fechaNacimiento: string, referencia: string): number | null {
  const n = normalizarFecha(fechaNacimiento);
  const r = normalizarFecha(referencia);
  if (!n || !r || n > r) return null;
  const [an, mn, dn] = n.split('-').map(Number) as [number, number, number];
  const [ar, mr, dr] = r.split('-').map(Number) as [number, number, number];
  return ar - an - (mr < mn || (mr === mn && dr < dn) ? 1 : 0);
}

function offsetSantiagoMinutos(instante: number): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(instante));
  const nombre = partes.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nombre);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** "2026-11-20" + "09:30" -> "2026-11-20T09:30:00-03:00" (offset real de America/Santiago ese día). */
export function instanteSantiago(fecha: string, hora: string): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const [h, mi] = hora.split(':').map(Number) as [number, number];
  const comoUtc = Date.UTC(a, m - 1, d, h, mi);
  const o1 = offsetSantiagoMinutos(comoUtc);
  const o2 = offsetSantiagoMinutos(comoUtc - o1 * 60_000);
  const signo = o2 < 0 ? '-' : '+';
  const abs = Math.abs(o2);
  return `${fecha}T${hora}:00${signo}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** AAAA-MM-DD + n días (aritmética en UTC, sin zona horaria). */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * Rango de instantes [desde 00:00, hasta+1 00:00) en America/Santiago, para consultar por día
 * calendario chileno sin que el huso del servidor cambie qué registros caen en cada día.
 */
export function rangoInstantesSantiago(desde: string, hasta: string): { gte: Date; lt: Date } {
  return {
    gte: new Date(instanteSantiago(desde, '00:00')),
    lt: new Date(instanteSantiago(sumarDias(hasta, 1), '00:00')),
  };
}
