import { z } from 'zod';

/** Lógica pura de reportes: tramos de edad, estadística de tiempos, tasas y filtros. */

export const TRAMOS = ['<18', '18-44', '45-64', '65+', 'Sin dato'] as const;
export type Tramo = (typeof TRAMOS)[number];

export function tramoEtario(edad: number | null): Tramo {
  if (edad === null || !Number.isFinite(edad) || edad < 0) return 'Sin dato';
  if (edad < 18) return '<18';
  if (edad < 45) return '18-44';
  if (edad < 65) return '45-64';
  return '65+';
}

/** Porcentaje con un decimal (p. ej. 66.7). Sin denominador no hay tasa: null, no 0. */
export function tasa(numerador: number, denominador: number): number | null {
  if (denominador <= 0) return null;
  return Math.round((numerador / denominador) * 1000) / 10;
}

/** Percentil por interpolación lineal (p entre 0 y 100). */
export function percentil(valores: readonly number[], p: number): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const rango = (Math.min(Math.max(p, 0), 100) / 100) * (v.length - 1);
  const i = Math.floor(rango);
  const frac = rango - i;
  const a = v[i]!;
  const b = v[Math.min(i + 1, v.length - 1)]!;
  return a + (b - a) * frac;
}

/** Meta del informe (RNF-09): registrar una llamada entrante en menos de 30 s. */
export const META_REGISTRO_SEGUNDOS = 30;

export interface ResumenTiempos {
  registros: number;
  promedio: number;
  mediana: number;
  p90: number;
  /** % de registros por debajo de la meta (menos de 30 s). */
  bajoMeta: number;
}

export function resumenTiempos(segundos: readonly number[]): ResumenTiempos | null {
  if (segundos.length === 0) return null;
  const suma = segundos.reduce((a, b) => a + b, 0);
  const bajo = segundos.filter((s) => s < META_REGISTRO_SEGUNDOS).length;
  return {
    registros: segundos.length,
    promedio: Math.round((suma / segundos.length) * 10) / 10,
    mediana: Math.round(percentil(segundos, 50)! * 10) / 10,
    p90: Math.round(percentil(segundos, 90)! * 10) / 10,
    bajoMeta: tasa(bajo, segundos.length)!,
  };
}

/**
 * Evita la inyección de fórmulas al abrir un Excel: un texto que empieza con = + - @ (o tabulación)
 * se interpretaría como fórmula. Se antepone un apóstrofo (Excel lo muestra como texto).
 */
export function sanitizarCelda<T>(valor: T): T | string {
  return typeof valor === 'string' && /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato AAAA-MM-DD')
  .refine((f) => {
    const d = new Date(`${f}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
  }, 'Fecha no válida');
export const MAX_DIAS_REPORTE = 366;

/** Días del rango, ambos extremos incluidos. */
export function diasEnRango(desde: string, hasta: string): number {
  const ms = (f: string) => Date.parse(`${f}T00:00:00Z`);
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000) + 1;
}

/** Filtros del reporte: rango de fechas obligatorio, hasta un año. */
export const filtrosReporteSchema = z
  .object({ centro: z.string().trim().min(1).optional(), desde: fecha, hasta: fecha })
  .superRefine((f, ctx) => {
    if (
      Number.isNaN(Date.parse(`${f.desde}T00:00:00Z`)) ||
      Number.isNaN(Date.parse(`${f.hasta}T00:00:00Z`))
    ) {
      ctx.addIssue({ code: 'custom', message: 'Fecha no válida' });
      return;
    }
    if (f.desde > f.hasta)
      ctx.addIssue({
        code: 'custom',
        path: ['desde'],
        message: 'La fecha inicial no puede ser posterior a la final',
      });
    else if (diasEnRango(f.desde, f.hasta) > MAX_DIAS_REPORTE) {
      ctx.addIssue({
        code: 'custom',
        path: ['hasta'],
        message: `El rango no puede superar ${MAX_DIAS_REPORTE} días`,
      });
    }
  });
export type FiltrosReporte = z.infer<typeof filtrosReporteSchema>;

export const filtrosDashboardSchema = z.object({
  centro: z.string().trim().min(1).optional(),
  fecha: fecha.optional(),
});
