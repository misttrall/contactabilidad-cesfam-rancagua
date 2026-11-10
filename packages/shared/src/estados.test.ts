import { describe, expect, it } from 'vitest';
import { esAdultoMayor, estadoTrasLlamada, puedeTransitar, requiereLlamada } from './estados';

describe('regla RN-01: sin respuesta nunca cancela', () => {
  it('recado y no ubicado dejan la cita en sin_respuesta y conservan el subestado', () => {
    expect(estadoTrasLlamada('recado')).toEqual({ estado: 'sin_respuesta', subestado: 'recado' });
    expect(estadoTrasLlamada('no_ubicado')).toEqual({
      estado: 'sin_respuesta',
      subestado: 'no_ubicado',
    });
  });
  it('solo "cancelado" cancela', () => {
    expect(estadoTrasLlamada('cancelado').estado).toBe('cancelado');
    expect(estadoTrasLlamada('confirmado').estado).toBe('confirmado');
  });
  it('desde sin_respuesta se puede confirmar o cancelar; confirmado y cancelado son finales', () => {
    expect(puedeTransitar('sin_respuesta', 'confirmado')).toBe(true);
    expect(puedeTransitar('confirmado', 'cancelado')).toBe(false);
    expect(puedeTransitar('cancelado', 'sin_respuesta')).toBe(false);
  });
});

describe('pendientes por llamar', () => {
  it('sin_respuesta siempre; enviado solo tras vencer la espera', () => {
    expect(requiereLlamada('sin_respuesta')).toBe(true);
    expect(requiereLlamada('enviado', 3)).toBe(false);
    expect(requiereLlamada('enviado', 30)).toBe(true);
    expect(requiereLlamada('confirmado')).toBe(false);
  });
  it('adulto mayor desde 65', () => {
    expect(esAdultoMayor(64)).toBe(false);
    expect(esAdultoMayor(65)).toBe(true);
  });
});
