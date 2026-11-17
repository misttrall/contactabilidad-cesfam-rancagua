/**
 * Genera la planilla de prueba para la demo con WhatsApp real: un paciente FICTICIO por cada celular de
 * DEMO_TELEFONOS_PRUEBA (archivo `.env` de la raíz), con la fecha de mañana (hora de Chile).
 *
 *   pnpm --filter @bh/api planilla-demo                 # citas para mañana
 *   pnpm --filter @bh/api planilla-demo -- 2026-11-18   # citas para esa fecha (AAAA-MM-DD)
 *
 * Deja `datos-demo/planilla-whatsapp.xlsx` en la raíz del proyecto (los .xlsx nunca se versionan).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function leerTelefonos(): string[] {
  const env = readFileSync(join(raiz, '.env'), 'utf8');
  const linea = env.split(/\r?\n/).find((l) => l.startsWith('DEMO_TELEFONOS_PRUEBA='));
  const telefonos = (linea?.split('=')[1] ?? '')
    .split('#')[0]!
    .split(',')
    .map((t) => t.replace(/[\s()-]/g, ''))
    .filter(Boolean);
  if (telefonos.length === 0) {
    throw new Error('DEMO_TELEFONOS_PRUEBA está vacía en el .env de la raíz');
  }
  return telefonos;
}

/** Dígito verificador chileno (módulo 11). */
function dv(cuerpo: number): string {
  let suma = 0;
  let factor = 2;
  for (const d of String(cuerpo).split('').reverse()) {
    suma += Number(d) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

function manana(): string {
  const f = new Date(Date.now() + 24 * 3_600_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(f);
}

const fechaIso = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? manana();
const [a, m, d] = fechaIso.split('-');
const fecha = `${d}-${m}-${a}`;

// Mezcla pensada para la demo: adulto mayor primero, crónicos, y una morbilidad (se excluye por defecto).
const PERFILES = [
  { nombre: 'Paciente Prueba WA 1 (adulto mayor)', nac: '01-01-1952', sexo: 'F', tipo: 'Crónico' },
  { nombre: 'Paciente Prueba WA 2', nac: '15-06-1971', sexo: 'M', tipo: 'Crónico' },
  { nombre: 'Paciente Prueba WA 3', nac: '03-09-1984', sexo: 'F', tipo: 'Crónico' },
  { nombre: 'Paciente Prueba WA 4 (morbilidad)', nac: '20-02-1990', sexo: 'M', tipo: 'Morbilidad' },
  { nombre: 'Paciente Prueba WA 5', nac: '11-11-1960', sexo: 'F', tipo: 'Crónico' },
] as const;
const HORAS = ['09:00', '09:30', '10:00', '10:30', '11:00'];

const telefonos = leerTelefonos();
const filas: (string | number)[][] = [
  [
    'Paciente',
    'RUT',
    'Teléfono',
    'Fecha',
    'Hora',
    'Profesional',
    'Prestación',
    'Tipo',
    'Fecha de nacimiento',
    'Sexo',
  ],
];
telefonos.slice(0, PERFILES.length).forEach((tel, i) => {
  const p = PERFILES[i]!;
  const cuerpo = 2_000_001 + i; // serie 2.000.00X: no choca con el seed demo (1.000.00X)
  filas.push([
    p.nombre,
    `${cuerpo}-${dv(cuerpo)}`,
    tel,
    fecha,
    HORAS[i]!,
    i % 2 === 0 ? 'Dra. Demo Uno' : 'Dr. Demo Dos',
    p.tipo === 'Crónico' ? 'Control crónico' : 'Consulta',
    p.tipo,
    p.nac,
    p.sexo,
  ]);
});

const libro = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), 'Citas');
const salida = join(raiz, 'datos-demo');
mkdirSync(salida, { recursive: true });
const archivo = join(salida, 'planilla-whatsapp.xlsx');
writeFileSync(archivo, XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
console.log(`Listo: ${archivo}`);
console.log(`${filas.length - 1} pacientes ficticios, cita el ${fecha} (celulares del equipo).`);
