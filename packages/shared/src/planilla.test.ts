import { describe, expect, it } from 'vitest';
import { mapearEncabezados, normalizarTexto, procesarMatriz, tipoDesdeTexto } from './planilla';

const ENC = ['Paciente', 'RUT', 'Teléfono', 'Fecha', 'Hora', 'Profesional', 'Prestación', 'Tipo'];
const fila = (o: Partial<Record<string, unknown>> = {}) => {
  const base: Record<string, unknown> = {
    Paciente: 'Paciente Demo 001',
    RUT: '1.000.001-7',
    Teléfono: '912345678',
    Fecha: '20-11-2026',
    Hora: '09:30',
    Profesional: 'Dra. Demo Uno',
    Prestación: 'Control crónico',
    Tipo: 'Crónico',
    ...o,
  };
  return ENC.map((h) => base[h]);
};

describe('mapeo de columnas', () => {
  it('reconoce alias sin distinguir mayúsculas ni tildes', () => {
    const m = mapearEncabezados([
      'NOMBRE',
      'Run',
      'Celular',
      'Fecha Cita',
      'Hora Cita',
      'Médico',
      'Atención',
      'Tipo de cita',
    ]);
    expect(m.faltantes).toEqual([]);
    expect(m.indices.rut).toBe(1);
  });
  it('informa faltantes y encabezados desconocidos', () => {
    const m = mapearEncabezados(['Paciente', 'RUT', 'Observaciones']);
    expect(m.faltantes).toContain('fecha');
    expect(m.desconocidos).toEqual(['Observaciones']);
  });
  it('normaliza texto', () => {
    expect(normalizarTexto('  Teléfono_Celular ')).toBe('telefono celular');
    expect(tipoDesdeTexto('Control Crónico')).toBe('cronico');
    expect(tipoDesdeTexto('MORBILIDAD')).toBe('morbilidad');
    expect(tipoDesdeTexto('otro')).toBeNull();
  });
});

describe('procesarMatriz', () => {
  const opts = { excluirMorbilidad: true };

  it('importa filas válidas y normaliza RUT, teléfono, fecha y hora', () => {
    const r = procesarMatriz([ENC, fila()], opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.validas).toHaveLength(1);
    expect(r.validas[0]).toMatchObject({
      rut: '1000001-7',
      telefono: '+56912345678',
      fecha: '2026-11-20',
      hora: '09:30',
      tipo: 'cronico',
    });
  });

  it('acepta fechas y horas como números de Excel', () => {
    const r = procesarMatriz([ENC, fila({ Fecha: 46346, Hora: 0.395833 })], opts);
    expect(r.ok && r.validas[0]).toMatchObject({ fecha: '2026-11-20', hora: '09:30' });
  });

  it('excluye morbilidad por defecto y la incluye si se pide', () => {
    const m = [ENC, fila(), fila({ RUT: '1000002-5', Tipo: 'Morbilidad' })];
    const a = procesarMatriz(m, { excluirMorbilidad: true });
    expect(a.ok && [a.validas.length, a.excluidasMorbilidad]).toEqual([1, 1]);
    const b = procesarMatriz(m, { excluirMorbilidad: false });
    expect(b.ok && [b.validas.length, b.excluidasMorbilidad]).toEqual([2, 0]);
  });

  it('reporta TODOS los errores de una fila con número de fila de Excel y columna', () => {
    const r = procesarMatriz([ENC, fila({ RUT: '1000001-9', Hora: '25:00', Tipo: 'x' })], opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.validas).toHaveLength(0);
    expect(r.erroresTotal).toBe(3);
    expect(r.errores.map((e) => [e.fila, e.columna])).toEqual(
      expect.arrayContaining([
        [2, 'RUT'],
        [2, 'Hora'],
        [2, 'Tipo'],
      ]),
    );
  });

  it('descarta filas repetidas dentro del archivo (misma cita) y las cuenta', () => {
    const r = procesarMatriz([ENC, fila(), fila(), fila({ Hora: '10:00' })], opts);
    expect(r.ok && [r.validas.length, r.repetidasEnArchivo]).toEqual([2, 1]);
  });

  it('ignora filas totalmente vacías', () => {
    const r = procesarMatriz([ENC, fila(), [], ['', null, '  ']], opts);
    expect(r.ok && r.totalFilas).toBe(1);
  });

  it('encuentra el encabezado aunque haya títulos arriba y numera las filas como Excel', () => {
    const r = procesarMatriz([['Agenda CESFAM'], [], ENC, fila({ RUT: 'mal' })], opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.errores[0]?.fila).toBe(4);
  });

  it('falla con mensaje claro si faltan columnas obligatorias', () => {
    const r = procesarMatriz(
      [
        ['Paciente', 'RUT'],
        ['A', '1'],
      ],
      opts,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Teléfono');
      expect(r.faltantes).toContain('hora');
    }
  });

  it('una hoja vacía falla sin lanzar excepción', () => {
    expect(procesarMatriz([], opts).ok).toBe(false);
  });

  it('lee columnas opcionales de fecha de nacimiento y sexo', () => {
    const enc = [...ENC, 'Fecha de nacimiento', 'Sexo'];
    const r = procesarMatriz([enc, [...fila(), '21-11-1958', 'Femenino']], opts);
    expect(r.ok && r.validas[0]).toMatchObject({ fechaNacimiento: '1958-11-21', sexo: 'F' });
  });

  it('limita los errores detallados pero cuenta todos', () => {
    const muchas = Array.from({ length: 300 }, () => fila({ RUT: 'mal' }));
    const r = procesarMatriz([ENC, ...muchas], opts);
    expect(r.ok && [r.erroresTotal, r.errores.length]).toEqual([300, 200]);
  });
});
