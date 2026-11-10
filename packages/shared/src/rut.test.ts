import { describe, expect, it } from 'vitest';
import {
  calcularDv,
  enmascararRut,
  enmascararTelefono,
  esRutValido,
  formatearRut,
  normalizarRut,
} from './rut';
import { PACIENTES_SEMILLA } from './semillas';

describe('rut', () => {
  it('calcula el dígito verificador por módulo 11', () => {
    expect(calcularDv('12345678')).toBe('5');
    expect(calcularDv('11111111')).toBe('1');
    expect(calcularDv('0')).toBe('0'); // resto 11 -> 0
    expect(calcularDv('6')).toBe('K'); // resto 10 -> K
  });
  it('valida con y sin puntos/guion, y acepta k minúscula', () => {
    expect(esRutValido('12.345.678-5')).toBe(true);
    expect(esRutValido('123456785')).toBe(true);
    expect(esRutValido('12.345.678-9')).toBe(false);
    expect(esRutValido('abc')).toBe(false);
    expect(esRutValido('1234')).toBe(false);
  });
  it('normaliza y formatea', () => {
    expect(normalizarRut('12.345.678-5')).toBe('12345678-5');
    expect(normalizarRut('12.345.678-0')).toBeNull();
    expect(formatearRut('123456785')).toBe('12.345.678-5');
  });
  it('enmascara RUT y teléfono para listas', () => {
    expect(enmascararRut('12345678-5')).toBe('12.345.***-5');
    expect(enmascararTelefono('+56912345678')).toBe('+56 9 **** 5678');
  });
  it('todos los RUT semilla son válidos', () => {
    for (const p of PACIENTES_SEMILLA) expect(esRutValido(p.rut), p.rut).toBe(true);
  });
});
