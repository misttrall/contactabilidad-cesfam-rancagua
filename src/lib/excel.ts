import * as XLSX from 'xlsx';
import type { Cita, Centro, Paciente } from '../data/types';

/** Columnas esperadas en la plantilla (fila 1). */
export const COLUMNAS_REQUERIDAS = [
  'RUT',
  'Nombre',
  'ApellidoPaterno',
  'ApellidoMaterno',
  'Telefono',
  'Edad',
  'Sexo',
  'Fecha',
  'Hora',
  'Profesional',
  'Prestacion',
  'Tipo',
] as const;

export type ParseResult =
  | { ok: true; citas: Cita[]; excluidasMorbilidad: number; totalFilas: number }
  | { ok: false; errores: string[] };

function normHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

function cell(row: Record<string, unknown>, key: string): string {
  const found = Object.entries(row).find(([k]) => normHeader(k).toLowerCase() === key.toLowerCase());
  const v = found?.[1];
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function parseTipo(raw: string): 'cronico' | 'morbilidad' | null {
  const t = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (t.startsWith('cron') || t === 'c') return 'cronico';
  if (t.startsWith('morb') || t === 'm') return 'morbilidad';
  return null;
}

function parseFecha(raw: string): string | null {
  if (!raw) return null;
  // Excel serial date
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
    return epoch.toISOString().slice(0, 10);
  }
  // DD-MM-YYYY or DD/MM/YYYY
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function parseHora(raw: string): string | null {
  if (!raw) return null;
  // Excel fraction of day
  if (/^0?\.\d+$/.test(raw) || (/^\d+(\.\d+)?$/.test(raw) && Number(raw) < 1)) {
    const fraction = Number(raw);
    const totalMin = Math.round(fraction * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return null;
}

export async function parseCitasExcel(
  file: File,
  centro: Centro,
  excluirMorbilidad: boolean
): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { ok: false, errores: ['El archivo no contiene hojas.'] };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rows.length === 0) {
    return { ok: false, errores: ['La hoja está vacía.'] };
  }

  const headers = Object.keys(rows[0]).map(normHeader);
  const required = COLUMNAS_REQUERIDAS.map((c) => c.toLowerCase());
  const missing = required.filter(
    (r) => !headers.some((h) => h.toLowerCase() === r.toLowerCase())
  );
  if (missing.length > 0) {
    return {
      ok: false,
      errores: [
        `Faltan columnas obligatorias: ${missing.join(', ')}.`,
        `Columnas encontradas: ${headers.join(', ') || '(ninguna)'}.`,
        `Descargue la plantilla oficial: /plantilla-citas-demo.xlsx`,
      ],
    };
  }

  const errores: string[] = [];
  const citas: Cita[] = [];
  let excluidasMorbilidad = 0;
  const stamp = Date.now();

  rows.forEach((row, idx) => {
    const fila = idx + 2; // header = 1
    const rut = cell(row, 'RUT');
    const nombre = cell(row, 'Nombre');
    const apellidoPaterno = cell(row, 'ApellidoPaterno');
    const apellidoMaterno = cell(row, 'ApellidoMaterno');
    const telefono = cell(row, 'Telefono');
    const edadRaw = cell(row, 'Edad');
    const sexoRaw = cell(row, 'Sexo').toUpperCase();
    const fechaRaw = cell(row, 'Fecha');
    const horaRaw = cell(row, 'Hora');
    const profesional = cell(row, 'Profesional');
    const prestacion = cell(row, 'Prestacion');
    const tipoRaw = cell(row, 'Tipo');

    if (!rut && !nombre) return; // fila vacía

    const rowErrors: string[] = [];
    if (!rut) rowErrors.push('RUT vacío');
    if (!nombre) rowErrors.push('Nombre vacío');
    if (!apellidoPaterno) rowErrors.push('ApellidoPaterno vacío');
    if (!telefono) rowErrors.push('Telefono vacío');
    const edad = Number(edadRaw);
    if (!edadRaw || Number.isNaN(edad) || edad < 0 || edad > 120) rowErrors.push('Edad inválida');
    if (sexoRaw !== 'M' && sexoRaw !== 'F') rowErrors.push('Sexo debe ser M o F');
    const fecha = parseFecha(fechaRaw);
    if (!fecha) rowErrors.push(`Fecha inválida (${fechaRaw || 'vacía'})`);
    const hora = parseHora(horaRaw);
    if (!hora) rowErrors.push(`Hora inválida (${horaRaw || 'vacía'})`);
    if (!profesional) rowErrors.push('Profesional vacío');
    if (!prestacion) rowErrors.push('Prestacion vacía');
    const tipo = parseTipo(tipoRaw);
    if (!tipo) rowErrors.push(`Tipo inválido (${tipoRaw || 'vacío'}); use cronico o morbilidad`);

    if (rowErrors.length) {
      errores.push(`Fila ${fila}: ${rowErrors.join('; ')}`);
      return;
    }

    if (excluirMorbilidad && tipo === 'morbilidad') {
      excluidasMorbilidad += 1;
      return;
    }

    const paciente: Paciente = {
      rut,
      nombre,
      apellidoPaterno,
      apellidoMaterno: apellidoMaterno || 'Demo',
      telefono,
      edad,
      sexo: sexoRaw as 'M' | 'F',
    };

    citas.push({
      id: `up-${stamp}-${idx}`,
      centroId: centro.id,
      centroNombre: centro.nombre,
      paciente,
      fecha: fecha!,
      hora: hora!,
      profesional,
      prestacion,
      tipo: tipo!,
      estadoConfirmacion: 'sin_enviar',
    });
  });

  if (errores.length > 0 && citas.length === 0) {
    return { ok: false, errores };
  }

  if (errores.length > 0) {
    return {
      ok: false,
      errores: [
        ...errores.slice(0, 15),
        ...(errores.length > 15 ? [`…y ${errores.length - 15} errores más`] : []),
      ],
    };
  }

  if (citas.length === 0) {
    return {
      ok: false,
      errores: [
        excluidasMorbilidad > 0
          ? `Todas las filas eran morbilidad y fueron excluidas (${excluidasMorbilidad}).`
          : 'No se encontraron filas válidas.',
      ],
    };
  }

  return { ok: true, citas, excluidasMorbilidad, totalFilas: rows.length };
}
