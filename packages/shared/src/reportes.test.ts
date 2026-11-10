import { describe, expect, it } from 'vitest';
import {
  META_REGISTRO_SEGUNDOS,
  diasEnRango,
  filtrosDashboardSchema,
  filtrosReporteSchema,
  percentil,
  resumenTiempos,
  sanitizarCelda,
  tasa,
  tramoEtario,
} from './reportes';

describe('tramos de edad', () => {
  it('limita cada tramo en sus bordes', () => {
    expect(tramoEtario(0)).toBe('<18');
    expect(tramoEtario(17)).toBe('<18');
    expect(tramoEtario(18)).toBe('18-44');
    expect(tramoEtario(44)).toBe('18-44');
    expect(tramoEtario(45)).toBe('45-64');
    expect(tramoEtario(64)).toBe('45-64');
    expect(tramoEtario(65)).toBe('65+'); // adulto mayor desde 65, igual que en el resto del sistema
    expect(tramoEtario(101)).toBe('65+');
  });
  it('sin dato o inválido no se adivina', () => {
    expect(tramoEtario(null)).toBe('Sin dato');
    expect(tramoEtario(-3)).toBe('Sin dato');
    expect(tramoEtario(Number.NaN)).toBe('Sin dato');
  });
});

describe('tasa', () => {
  it('redondea a un decimal', () => {
    expect(tasa(2, 3)).toBe(66.7);
    expect(tasa(1, 3)).toBe(33.3);
    expect(tasa(5, 5)).toBe(100);
    expect(tasa(0, 4)).toBe(0);
  });
  it('sin denominador no hay tasa (null, no 0 %)', () => {
    expect(tasa(0, 0)).toBeNull();
    expect(tasa(3, 0)).toBeNull();
  });
});

describe('percentil y tiempos', () => {
  it('interpola entre valores y no depende del orden de entrada', () => {
    expect(percentil([10, 20, 30, 40], 50)).toBe(25);
    expect(percentil([40, 10, 30, 20], 50)).toBe(25);
    expect(percentil([5], 90)).toBe(5);
    expect(percentil([], 50)).toBeNull();
    expect(percentil([1, 2, 3], 0)).toBe(1);
    expect(percentil([1, 2, 3], 100)).toBe(3);
  });
  it('resume los tiempos y mide cuántos cumplen la meta de 30 s', () => {
    const r = resumenTiempos([10, 20, 28, 30, 90])!;
    expect(r.registros).toBe(5);
    expect(r.promedio).toBe(35.6);
    expect(r.mediana).toBe(28);
    expect(r.bajoMeta).toBe(60); // 10, 20 y 28 (el 30 NO es «menos de 30»)
    expect(META_REGISTRO_SEGUNDOS).toBe(30);
  });
  it('sin registros no hay resumen', () => {
    expect(resumenTiempos([])).toBeNull();
  });
});

describe('sanitizarCelda (inyección de fórmulas en Excel)', () => {
  it('neutraliza textos que Excel interpretaría como fórmula', () => {
    for (const peligroso of ['=1+1', '+cmd|calc', '-2+3', '@SUM(A1)', '\t=x']) {
      expect(String(sanitizarCelda(peligroso)).startsWith("'")).toBe(true);
    }
  });
  it('deja intactos el texto normal y los números', () => {
    expect(sanitizarCelda('CESFAM Centro')).toBe('CESFAM Centro');
    expect(sanitizarCelda(42)).toBe(42);
    expect(sanitizarCelda(null)).toBeNull();
    expect(sanitizarCelda('65+')).toBe('65+');
  });
});

describe('filtros del reporte', () => {
  it('cuenta los días con ambos extremos', () => {
    expect(diasEnRango('2026-11-01', '2026-11-01')).toBe(1);
    expect(diasEnRango('2026-11-01', '2026-11-30')).toBe(30);
  });
  it('acepta un rango válido y rechaza invertido, demasiado largo o con fecha imposible', () => {
    expect(
      filtrosReporteSchema.safeParse({ desde: '2026-11-01', hasta: '2026-11-30' }).success,
    ).toBe(true);
    expect(
      filtrosReporteSchema.safeParse({ desde: '2026-11-30', hasta: '2026-11-01' }).success,
    ).toBe(false);
    expect(
      filtrosReporteSchema.safeParse({ desde: '2025-01-01', hasta: '2026-11-30' }).success,
    ).toBe(false);
    expect(
      filtrosReporteSchema.safeParse({ desde: '2026-13-45', hasta: '2026-11-30' }).success,
    ).toBe(false);
    expect(filtrosReporteSchema.safeParse({ hasta: '2026-11-30' }).success).toBe(false);
  });
  it('un año completo (366 días) está permitido', () => {
    expect(
      filtrosReporteSchema.safeParse({ desde: '2026-01-01', hasta: '2026-12-31' }).success,
    ).toBe(true);
  });
});

describe('validación de fechas de filtros', () => {
  it('rechaza fechas que no existen en el calendario', () => {
    expect(filtrosDashboardSchema.safeParse({ fecha: '2026-13-45' }).success).toBe(false);
    expect(filtrosDashboardSchema.safeParse({ fecha: '2026-02-30' }).success).toBe(false);
    expect(filtrosDashboardSchema.safeParse({ fecha: '2028-02-29' }).success).toBe(true);
  });
});
