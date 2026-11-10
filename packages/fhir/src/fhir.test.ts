import { ESTADOS_CITA } from '@bh/shared';
import { describe, expect, it } from 'vitest';
import { construirCapabilityStatement } from './capability';
import { estadoDesdeBusinessStatus, MAPEO_ESTADO_FHIR } from './mapeo-estados';
import { pacienteAFhir, resumenParaLog } from './recursos';

describe('mapeo de estados a FHIR', () => {
  it('RN-01: ningún estado de contactabilidad cancela el Appointment', () => {
    for (const e of ESTADOS_CITA) expect(MAPEO_ESTADO_FHIR[e].appointmentStatus).toBe('booked');
  });
  it('cubre todos los estados y es invertible', () => {
    for (const e of ESTADOS_CITA) {
      expect(estadoDesdeBusinessStatus(MAPEO_ESTADO_FHIR[e].businessStatus)).toBe(e);
    }
  });
  it('Sí/No del paciente se traducen a accepted/declined', () => {
    expect(MAPEO_ESTADO_FHIR.confirmado.appointmentResponse).toBe('accepted');
    expect(MAPEO_ESTADO_FHIR.cancelado.appointmentResponse).toBe('declined');
    expect(MAPEO_ESTADO_FHIR.sin_respuesta.appointmentResponse).toBeUndefined();
  });
});

describe('Patient', () => {
  const dom = {
    rut: '1.000.001-7',
    nombre: 'Paciente Demo 001',
    sexo: 'M',
    telefono: '+56900000001',
  } as const;
  it('emite identifier normalizado y sexo FHIR', () => {
    const p = pacienteAFhir(dom, 'p1');
    expect(p.identifier[0]?.value).toBe('1000001-7');
    expect(p.gender).toBe('male');
  });
  it('rechaza RUT inválido', () => {
    expect(() => pacienteAFhir({ ...dom, rut: '1000001-9' })).toThrow();
  });
  it('el resumen de log enmascara el teléfono', () => {
    expect(resumenParaLog(pacienteAFhir(dom, 'p1'))).not.toContain('900000001');
  });
});

describe('CapabilityStatement', () => {
  it('declara FHIR 4.0.1 en JSON', () => {
    const c = construirCapabilityStatement({
      version: '0.2.0',
      fecha: '2026-11-10T00:00:00Z',
      baseUrl: 'http://x',
    });
    expect(c.fhirVersion).toBe('4.0.1');
    expect(c.format).toEqual(['json']);
  });
});
