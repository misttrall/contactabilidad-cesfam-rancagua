import * as XLSX from 'xlsx';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'public', 'plantilla-citas-demo.xlsx');

const rows = [
  {
    RUT: '00.000.201-9',
    Nombre: 'Demo',
    ApellidoPaterno: 'Lambda',
    ApellidoMaterno: 'Once',
    Telefono: '+56900000201',
    Edad: 67,
    Sexo: 'F',
    Fecha: '2026-11-14',
    Hora: '08:30',
    Profesional: 'Dra. Demo Plantilla',
    Prestacion: 'Control Crónico',
    Tipo: 'cronico',
  },
  {
    RUT: '00.000.202-7',
    Nombre: 'Demo',
    ApellidoPaterno: 'Mu',
    ApellidoMaterno: 'Doce',
    Telefono: '+56900000202',
    Edad: 52,
    Sexo: 'M',
    Fecha: '2026-11-14',
    Hora: '09:00',
    Profesional: 'Dr. Demo Plantilla',
    Prestacion: 'Control DM2',
    Tipo: 'cronico',
  },
  {
    RUT: '00.000.203-5',
    Nombre: 'Demo',
    ApellidoPaterno: 'Nu',
    ApellidoMaterno: 'Trece',
    Telefono: '+56900000203',
    Edad: 39,
    Sexo: 'F',
    Fecha: '2026-11-14',
    Hora: '09:30',
    Profesional: 'Enf. Demo Plantilla',
    Prestacion: 'Curación',
    Tipo: 'morbilidad',
  },
  {
    RUT: '00.000.204-3',
    Nombre: 'Demo',
    ApellidoPaterno: 'Xi',
    ApellidoMaterno: 'Catorce',
    Telefono: '+56900000204',
    Edad: 71,
    Sexo: 'M',
    Fecha: '2026-11-14',
    Hora: '10:00',
    Profesional: 'Dra. Demo Plantilla',
    Prestacion: 'Control HTA',
    Tipo: 'cronico',
  },
  {
    RUT: '00.000.205-1',
    Nombre: 'Demo',
    ApellidoPaterno: 'Omicron',
    ApellidoMaterno: 'Quince',
    Telefono: '+56900000205',
    Edad: 44,
    Sexo: 'F',
    Fecha: '2026-11-14',
    Hora: '10:30',
    Profesional: 'Dr. Demo Plantilla',
    Prestacion: 'Control Crónico',
    Tipo: 'cronico',
  },
];

const sheet = XLSX.utils.json_to_sheet(rows);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, 'Citas');
mkdirSync(dirname(out), { recursive: true });
const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(out, buf);
console.log('Wrote', out);
