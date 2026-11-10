import { describe, expect, it } from 'vitest';
import {
  edadCumplida,
  fraccionAHora,
  instanteSantiago,
  normalizarFecha,
  normalizarHora,
  serialExcelAFecha,
} from './fechas';

describe('fechas de Excel', () => {
  it('convierte números serie sin depender de la zona horaria', () => {
    expect(serialExcelAFecha(46346)).toBe('2026-11-20');
    expect(serialExcelAFecha(46346.99)).toBe('2026-11-20'); // la parte horaria no cambia el día
    expect(serialExcelAFecha(5)).toBeNull(); // fuera de rango plausible
  });
  it('acepta los formatos de texto habituales', () => {
    expect(normalizarFecha('2026-11-20')).toBe('2026-11-20');
    expect(normalizarFecha('20-11-2026')).toBe('2026-11-20');
    expect(normalizarFecha('20/11/2026')).toBe('2026-11-20');
    expect(normalizarFecha('5.1.2026')).toBe('2026-01-05');
    expect(normalizarFecha('20/11/2026 09:30')).toBe('2026-11-20');
  });
  it('rechaza fechas imposibles o ambiguas', () => {
    expect(normalizarFecha('31/02/2026')).toBeNull();
    expect(normalizarFecha('2026-13-01')).toBeNull();
    expect(normalizarFecha('mañana')).toBeNull();
    expect(normalizarFecha(null)).toBeNull();
  });
  it('convierte horas: fracción de día y texto', () => {
    expect(fraccionAHora(0.395833)).toBe('09:30');
    expect(fraccionAHora(0.5)).toBe('12:00');
    expect(normalizarHora(0.395833)).toBe('09:30');
    expect(normalizarHora('9:30')).toBe('09:30');
    expect(normalizarHora('09:30:00')).toBe('09:30');
    expect(normalizarHora('24:00')).toBeNull();
    expect(normalizarHora('9h30')).toBeNull();
  });
});

describe('edad', () => {
  it('cumplida a una fecha de referencia', () => {
    expect(edadCumplida('1958-11-21', '2026-11-20')).toBe(67);
    expect(edadCumplida('1958-11-20', '2026-11-20')).toBe(68);
    expect(edadCumplida('2030-01-01', '2026-11-20')).toBeNull();
  });
});

describe('instanteSantiago', () => {
  it('usa el offset real de Chile: -03:00 en verano y -04:00 en invierno', () => {
    expect(instanteSantiago('2026-11-20', '09:30')).toBe('2026-11-20T09:30:00-03:00');
    expect(instanteSantiago('2026-06-15', '09:30')).toBe('2026-06-15T09:30:00-04:00');
  });
});
