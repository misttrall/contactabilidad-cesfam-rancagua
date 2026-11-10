import { z } from 'zod';
import { normalizarFecha, normalizarHora } from './fechas';
import { filaPlanillaSchema } from './schemas';

/**
 * Lectura de la planilla exportada desde AVIS.
 *
 * SUPUESTO A CONFIRMAR CON EL CESFAM (PLAN_MVP §7): los nombres exactos de las columnas de la
 * exportación real. Mientras tanto se reconocen los del informe (Paciente, RUT, Teléfono, Fecha,
 * Hora, Profesional, Prestación, Tipo) y variantes comunes, sin distinguir mayúsculas ni tildes.
 * Agregar alias aquí es el único cambio necesario cuando se conozca el formato real.
 */
export const CAMPOS = [
  'paciente',
  'rut',
  'telefono',
  'fecha',
  'hora',
  'profesional',
  'prestacion',
  'tipo',
  'fechaNacimiento',
  'sexo',
] as const;
export type Campo = (typeof CAMPOS)[number];

export const CAMPOS_REQUERIDOS: readonly Campo[] = [
  'paciente',
  'rut',
  'telefono',
  'fecha',
  'hora',
  'profesional',
  'prestacion',
  'tipo',
];

export const ETIQUETA_COLUMNA: Record<Campo, string> = {
  paciente: 'Paciente',
  rut: 'RUT',
  telefono: 'Teléfono',
  fecha: 'Fecha',
  hora: 'Hora',
  profesional: 'Profesional',
  prestacion: 'Prestación',
  tipo: 'Tipo',
  fechaNacimiento: 'Fecha de nacimiento',
  sexo: 'Sexo',
};

const ALIAS: Record<Campo, readonly string[]> = {
  paciente: ['paciente', 'nombre', 'nombre paciente', 'nombre del paciente', 'nombre completo'],
  rut: ['rut', 'run', 'rut paciente', 'rut del paciente', 'run paciente'],
  telefono: ['telefono', 'fono', 'celular', 'telefono celular', 'movil', 'telefono contacto'],
  fecha: ['fecha', 'fecha cita', 'fecha de cita', 'fecha atencion', 'fecha agenda'],
  hora: ['hora', 'hora cita', 'hora de cita', 'hora atencion', 'hora agenda'],
  profesional: [
    'profesional',
    'medico',
    'nombre profesional',
    'profesional tratante',
    'funcionario',
  ],
  prestacion: ['prestacion', 'atencion', 'actividad', 'tipo atencion', 'tipo de atencion'],
  tipo: ['tipo', 'tipo cita', 'tipo de cita', 'tipo control', 'clasificacion'],
  fechaNacimiento: ['fecha nacimiento', 'fecha de nacimiento', 'nacimiento', 'f nacimiento'],
  sexo: ['sexo', 'genero'],
};

export const MAX_FILAS = 5000;
export const MAX_ERRORES_DETALLADOS = 200;

/** minúsculas, sin tildes, solo letras/números separados por un espacio. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface MapeoColumnas {
  /** Índice de columna por campo reconocido. */
  indices: Partial<Record<Campo, number>>;
  faltantes: Campo[];
  /** Encabezados que no se reconocieron (se ignoran; se informan por transparencia). */
  desconocidos: string[];
}

export function mapearEncabezados(encabezados: readonly unknown[]): MapeoColumnas {
  const indices: Partial<Record<Campo, number>> = {};
  const desconocidos: string[] = [];
  encabezados.forEach((h, i) => {
    const texto = typeof h === 'string' || typeof h === 'number' ? normalizarTexto(String(h)) : '';
    if (!texto) return;
    const campo = CAMPOS.find((c) => ALIAS[c].includes(texto));
    if (campo && indices[campo] === undefined) indices[campo] = i;
    else if (!campo) desconocidos.push(String(h).trim());
  });
  return {
    indices,
    faltantes: CAMPOS_REQUERIDOS.filter((c) => indices[c] === undefined),
    desconocidos,
  };
}

export function tipoDesdeTexto(v: unknown): 'cronico' | 'morbilidad' | null {
  if (typeof v !== 'string') return null;
  const t = normalizarTexto(v);
  if (t.includes('cronic')) return 'cronico';
  if (t.includes('morbil')) return 'morbilidad';
  return null;
}

export function sexoDesdeTexto(v: unknown): 'M' | 'F' | null {
  if (typeof v !== 'string') return null;
  const t = normalizarTexto(v);
  if (['m', 'masculino', 'hombre', 'h'].includes(t)) return 'M';
  if (['f', 'femenino', 'mujer'].includes(t)) return 'F';
  return null;
}

export const filaCargaSchema = filaPlanillaSchema.extend({
  fechaNacimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sexo: z.enum(['M', 'F']).optional(),
});
export type FilaCarga = z.infer<typeof filaCargaSchema>;

export interface ErrorFila {
  /** Número de fila en Excel (la fila 1 es el encabezado). */
  fila: number;
  columna: string;
  mensaje: string;
}

const textoDe = (v: unknown): string =>
  v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v);

const vacia = (celdas: readonly unknown[]) =>
  celdas.every((c) => c === null || c === undefined || String(c).trim() === '');

/** Valida una fila. Devuelve la fila normalizada o TODOS sus errores (no solo el primero). */
export function validarFila(
  celdas: readonly unknown[],
  mapeo: MapeoColumnas,
  nFila: number,
): { ok: true; fila: FilaCarga } | { ok: false; errores: ErrorFila[] } {
  const v = (c: Campo): unknown => {
    const i = mapeo.indices[c];
    return i === undefined ? undefined : celdas[i];
  };
  const errores: ErrorFila[] = [];
  const err = (c: Campo, mensaje: string) =>
    errores.push({ fila: nFila, columna: ETIQUETA_COLUMNA[c], mensaje });

  const fecha = normalizarFecha(v('fecha'));
  if (!fecha) err('fecha', 'Fecha no válida (usa DD-MM-AAAA o una fecha de Excel)');
  const hora = normalizarHora(v('hora'));
  if (!hora) err('hora', 'Hora no válida (usa HH:mm)');
  const tipo = tipoDesdeTexto(v('tipo'));
  if (!tipo) err('tipo', 'Tipo no reconocido: debe ser Crónico o Morbilidad');

  let fechaNacimiento: string | undefined;
  if (mapeo.indices.fechaNacimiento !== undefined && textoDe(v('fechaNacimiento')).trim() !== '') {
    fechaNacimiento = normalizarFecha(v('fechaNacimiento')) ?? undefined;
    if (!fechaNacimiento) err('fechaNacimiento', 'Fecha de nacimiento no válida');
  }
  let sexo: 'M' | 'F' | undefined;
  if (mapeo.indices.sexo !== undefined && textoDe(v('sexo')).trim() !== '') {
    sexo = sexoDesdeTexto(v('sexo')) ?? undefined;
    if (!sexo) err('sexo', 'Sexo no reconocido (M/F)');
  }

  const r = filaCargaSchema.safeParse({
    paciente: textoDe(v('paciente')),
    rut: textoDe(v('rut')),
    telefono: textoDe(v('telefono')),
    fecha: fecha ?? '',
    hora: hora ?? '',
    profesional: textoDe(v('profesional')),
    prestacion: textoDe(v('prestacion')),
    tipo: tipo ?? '',
    ...(fechaNacimiento ? { fechaNacimiento } : {}),
    ...(sexo ? { sexo } : {}),
  });
  if (!r.success) {
    const ya = new Set(errores.map((e) => e.columna));
    for (const issue of r.error.issues) {
      const campo = issue.path[0] as Campo;
      const columna = ETIQUETA_COLUMNA[campo] ?? String(issue.path[0]);
      // Fecha/hora/tipo ya tienen un mensaje propio más claro.
      if (!ya.has(columna)) {
        errores.push({ fila: nFila, columna, mensaje: issue.message });
        ya.add(columna);
      }
    }
  }
  return errores.length > 0 || !r.success ? { ok: false, errores } : { ok: true, fila: r.data };
}

/** Clave de idempotencia de una cita dentro de un centro. */
export function claveCita(f: Pick<FilaCarga, 'rut' | 'fecha' | 'hora' | 'profesional'>): string {
  return `${f.rut}|${f.fecha}|${f.hora}|${normalizarTexto(f.profesional)}`;
}

export type ResultadoValidacion =
  | { ok: false; error: string; faltantes: Campo[]; encabezadosLeidos: string[] }
  | {
      ok: true;
      mapeo: MapeoColumnas;
      totalFilas: number;
      /** Filas válidas que se importarían (ya sin morbilidad excluida ni repetidas). */
      validas: FilaCarga[];
      excluidasMorbilidad: number;
      repetidasEnArchivo: number;
      erroresTotal: number;
      /** Primeros MAX_ERRORES_DETALLADOS errores. */
      errores: ErrorFila[];
    };

/**
 * Procesa la matriz de celdas de la hoja (fila 0 = primera fila no vacía = encabezados, buscando
 * en las primeras 10 filas por si el export trae títulos arriba).
 */
export function procesarMatriz(
  matriz: readonly (readonly unknown[])[],
  opciones: { excluirMorbilidad: boolean },
): ResultadoValidacion {
  let inicio = -1;
  let mapeo: MapeoColumnas | null = null;
  for (let i = 0; i < Math.min(matriz.length, 10); i++) {
    const fila = matriz[i] ?? [];
    if (vacia(fila)) continue;
    const m = mapearEncabezados(fila);
    if (!mapeo || m.faltantes.length < mapeo.faltantes.length) {
      mapeo = m;
      inicio = i;
    }
    if (m.faltantes.length === 0) break;
  }
  if (!mapeo || inicio < 0 || mapeo.faltantes.length > 0) {
    const leidos = (matriz[Math.max(inicio, 0)] ?? [])
      .filter((c) => c !== null && c !== undefined && String(c).trim() !== '')
      .map(String);
    const faltantes = mapeo?.faltantes ?? [...CAMPOS_REQUERIDOS];
    return {
      ok: false,
      error: `Faltan columnas obligatorias: ${faltantes.map((c) => ETIQUETA_COLUMNA[c]).join(', ')}`,
      faltantes,
      encabezadosLeidos: leidos,
    };
  }

  const datos = matriz.slice(inicio + 1);
  const validas: FilaCarga[] = [];
  const errores: ErrorFila[] = [];
  const vistas = new Set<string>();
  let totalFilas = 0;
  let excluidas = 0;
  let repetidas = 0;
  let erroresTotal = 0;

  datos.forEach((celdas, i) => {
    if (vacia(celdas)) return;
    totalFilas++;
    const nFila = inicio + 2 + i; // número de fila en Excel
    const r = validarFila(celdas, mapeo, nFila);
    if (!r.ok) {
      erroresTotal += r.errores.length;
      for (const e of r.errores) if (errores.length < MAX_ERRORES_DETALLADOS) errores.push(e);
      return;
    }
    if (opciones.excluirMorbilidad && r.fila.tipo === 'morbilidad') {
      excluidas++;
      return;
    }
    const clave = claveCita(r.fila);
    if (vistas.has(clave)) {
      repetidas++;
      return;
    }
    vistas.add(clave);
    validas.push(r.fila);
  });

  return {
    ok: true,
    mapeo,
    totalFilas,
    validas,
    excluidasMorbilidad: excluidas,
    repetidasEnArchivo: repetidas,
    erroresTotal,
    errores,
  };
}
