import { BadRequestException } from '@nestjs/common';
import { MAX_FILAS } from '@bh/shared';
import * as XLSX from 'xlsx';

export const MAX_BYTES = 5 * 1024 * 1024;

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // .xlsx (y .xlsm)
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // .xls

const empieza = (b: Buffer, firma: number[]) => firma.every((x, i) => b[i] === x);

/**
 * Lee la primera hoja como matriz de celdas. Defensas:
 * - se valida el contenido real (firma ZIP/OLE), no solo la extensión;
 * - no se evalúan fórmulas ni HTML; se rechazan libros con macros (.xlsm);
 * - se limita el número de filas leídas.
 */
export function leerHoja(buffer: Buffer): unknown[][] {
  if (buffer.length === 0) throw new BadRequestException('El archivo está vacío');
  if (buffer.length > MAX_BYTES) throw new BadRequestException('El archivo supera los 5 MB');
  if (!empieza(buffer, ZIP) && !empieza(buffer, OLE)) {
    throw new BadRequestException('El archivo no es una planilla Excel (.xlsx o .xls)');
  }
  let libro: XLSX.WorkBook;
  try {
    libro = XLSX.read(buffer, {
      type: 'buffer',
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: true,
      sheetRows: MAX_FILAS + 12,
    });
  } catch {
    throw new BadRequestException(
      'No se pudo leer el archivo: está dañado o no es una planilla válida',
    );
  }
  if (libro.vbaraw) {
    throw new BadRequestException(
      'Las planillas con macros no están permitidas: guarda el archivo como .xlsx',
    );
  }
  const nombre = libro.SheetNames[0];
  const hoja = nombre ? libro.Sheets[nombre] : undefined;
  if (!hoja) throw new BadRequestException('La planilla no tiene hojas');
  return XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
}

/** Plantilla descargable: encabezados exactos + 3 filas ficticias + hoja de instrucciones. */
export function generarPlantilla(fechaEjemplo: string): Buffer {
  const [a, m, d] = fechaEjemplo.split('-');
  const fecha = `${d}-${m}-${a}`;
  const filas = [
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
    [
      'Paciente Demo 001',
      '1000001-7',
      '+56900000001',
      fecha,
      '09:00',
      'Dra. Demo Uno',
      'Control crónico',
      'Crónico',
      '01-01-1958',
      'M',
    ],
    [
      'Paciente Demo 002',
      '1000002-5',
      '+56900000002',
      fecha,
      '09:30',
      'Dra. Demo Uno',
      'Control crónico',
      'Crónico',
      '15-06-1981',
      'F',
    ],
    [
      'Paciente Demo 003',
      '1000003-3',
      '+56900000003',
      fecha,
      '10:00',
      'Dr. Demo Dos',
      'Consulta',
      'Morbilidad',
      '',
      '',
    ],
  ];
  const instrucciones = [
    ['Cómo completar la planilla'],
    ['Las columnas Paciente a Tipo son obligatorias. Fecha de nacimiento y Sexo son opcionales.'],
    [
      'Fecha: DD-MM-AAAA. Hora: HH:mm. Tipo: Crónico o Morbilidad (la morbilidad se excluye por defecto).',
    ],
    ['RUT con dígito verificador (con o sin puntos). Teléfono: celular chileno (9 XXXX XXXX).'],
    ['Los datos de esta plantilla son FICTICIOS. Reemplázalos con la exportación de AVIS.'],
    ['El sistema lee solo la primera hoja.'],
  ];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), 'Citas');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(instrucciones), 'Instrucciones');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Solo para pruebas y la plantilla: arma un .xlsx desde una matriz. */
export function construirXlsx(matriz: unknown[][], formato: 'xlsx' | 'xls' = 'xlsx'): Buffer {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(matriz), 'Hoja1');
  return XLSX.write(libro, { type: 'buffer', bookType: formato }) as Buffer;
}
