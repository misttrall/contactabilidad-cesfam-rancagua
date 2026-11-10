import { describe, expect, it } from 'vitest';
import {
  AYUDA_RESULTADO,
  ETIQUETA_RESULTADO,
  filtrosHistorialSchema,
  registroEntranteSchema,
  resultadoSalienteSchema,
} from './llamadas';
import { RESULTADOS_LLAMADA } from './estados';

const UUID = '0b8f8c52-1e0a-4b46-9a53-6f4a3f0a9d11';

describe('resultado de llamada saliente', () => {
  it('acepta los cuatro resultados y una observación opcional', () => {
    for (const r of RESULTADOS_LLAMADA) {
      expect(resultadoSalienteSchema.safeParse({ resultado: r }).success).toBe(true);
    }
    const ok = resultadoSalienteSchema.parse({
      resultado: 'recado',
      observacion: '  Dejé mensaje  ',
    });
    expect(ok.observacion).toBe('Dejé mensaje');
  });
  it('una observación vacía se descarta y una larga se rechaza', () => {
    expect(
      resultadoSalienteSchema.parse({ resultado: 'recado', observacion: '   ' }).observacion,
    ).toBeUndefined();
    expect(
      resultadoSalienteSchema.safeParse({ resultado: 'recado', observacion: 'x'.repeat(501) })
        .success,
    ).toBe(false);
  });
  it('rechaza resultados desconocidos y campos extra (no se puede colar el estado)', () => {
    expect(resultadoSalienteSchema.safeParse({ resultado: 'cancelada' }).success).toBe(false);
    expect(
      resultadoSalienteSchema.safeParse({ resultado: 'recado', estado: 'confirmado' }).success,
    ).toBe(false);
  });
  it('cada resultado tiene etiqueta y ayuda; «sin respuesta» nunca se presenta como cancelación', () => {
    for (const r of RESULTADOS_LLAMADA) {
      expect(ETIQUETA_RESULTADO[r]).toBeTruthy();
      expect(AYUDA_RESULTADO[r]).toBeTruthy();
    }
    expect(AYUDA_RESULTADO.recado).toMatch(/sigue vigente/);
    expect(AYUDA_RESULTADO.no_ubicado).toMatch(/sigue vigente/);
    expect(AYUDA_RESULTADO.cancelado).toMatch(/liberar la hora en AVIS/);
  });
});

describe('registro de llamada entrante', () => {
  const base = { rut: '1.000.001-7', motivoId: UUID };
  it('normaliza el RUT y acepta el mínimo', () => {
    const r = registroEntranteSchema.parse(base);
    expect(r.rut).toBe('1000001-7');
  });
  it('rechaza RUT inválido, motivo que no es id y segundos fuera de rango', () => {
    expect(registroEntranteSchema.safeParse({ ...base, rut: '1000001-9' }).success).toBe(false);
    expect(registroEntranteSchema.safeParse({ ...base, motivoId: 'otros' }).success).toBe(false);
    expect(registroEntranteSchema.safeParse({ ...base, segundos: -1 }).success).toBe(false);
    expect(registroEntranteSchema.safeParse({ ...base, segundos: 99999 }).success).toBe(false);
  });
  it('rechaza campos desconocidos', () => {
    expect(registroEntranteSchema.safeParse({ ...base, pacienteId: UUID }).success).toBe(false);
  });
});

describe('filtros del historial', () => {
  it('aplica paginación por defecto y convierte números', () => {
    expect(filtrosHistorialSchema.parse({})).toMatchObject({ pagina: 1, tam: 25 });
    expect(filtrosHistorialSchema.parse({ pagina: '3', tam: '50' })).toMatchObject({
      pagina: 3,
      tam: 50,
    });
  });
  it('limita el tamaño de página y valida fechas', () => {
    expect(filtrosHistorialSchema.safeParse({ tam: '1000' }).success).toBe(false);
    expect(filtrosHistorialSchema.safeParse({ pagina: '0' }).success).toBe(false);
    expect(filtrosHistorialSchema.safeParse({ desde: '20-11-2026' }).success).toBe(false);
    expect(
      filtrosHistorialSchema.safeParse({ desde: '2026-11-20', hasta: '2026-11-25' }).success,
    ).toBe(true);
  });
  it('la búsqueda exige al menos 2 caracteres', () => {
    expect(filtrosHistorialSchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(filtrosHistorialSchema.safeParse({ q: 'Perez' }).success).toBe(true);
  });
});
