import { describe, expect, it } from 'vitest';
import { bajaCanalAFhir, liberacionAFhir, mensajeAFhir, respuestaCitaAFhir } from './mensajes';

const t = new Date('2026-11-20T15:00:00Z');

describe('Communication', () => {
  const base = { id: 'm1', citaId: 'a1', pacienteId: 'p1', tipo: 'confirmacion' as const };
  it('mapea cada estado del mensaje', () => {
    expect(mensajeAFhir({ ...base, estado: 'en_cola' }).status).toBe('preparation');
    expect(mensajeAFhir({ ...base, estado: 'enviado' }).status).toBe('in-progress');
    expect(mensajeAFhir({ ...base, estado: 'entregado' }).status).toBe('completed');
    expect(mensajeAFhir({ ...base, estado: 'leido' }).status).toBe('completed');
    expect(mensajeAFhir({ ...base, estado: 'fallido' }).status).toBe('not-done');
  });
  it('indica WhatsApp, la cita y el paciente, y las horas de envío y entrega', () => {
    const c = mensajeAFhir({ ...base, estado: 'entregado', enviadoEn: t, entregadoEn: t });
    expect(c.medium[0]?.coding[0]?.code).toBe('whatsapp');
    expect(c.about[0]?.reference).toBe('Appointment/a1');
    expect(c.subject.reference).toBe('Patient/p1');
    expect(c.sent).toBe(t.toISOString());
    expect(c.received).toBe(t.toISOString());
  });
  it('un fallo lleva solo el código de error, y NO existe payload con texto', () => {
    const c = mensajeAFhir({ ...base, estado: 'fallido', errorCodigo: '131026' });
    expect(c.statusReason?.text).toBe('error 131026');
    expect('payload' in c).toBe(false);
  });
});

describe('AppointmentResponse', () => {
  const r = { id: 't1', citaId: 'a1', pacienteId: 'p1', respondidoEn: t };
  it('«Sí» es accepted y «No» es declined', () => {
    expect(respuestaCitaAFhir({ ...r, respuesta: 'si' }).participantStatus).toBe('accepted');
    expect(respuestaCitaAFhir({ ...r, respuesta: 'no' }).participantStatus).toBe('declined');
  });
  it('referencia la cita y al paciente', () => {
    const a = respuestaCitaAFhir({ ...r, respuesta: 'si' });
    expect(a.appointment.reference).toBe('Appointment/a1');
    expect(a.actor.reference).toBe('Patient/p1');
  });
});

describe('Task «liberar hora en AVIS»', () => {
  it('pendiente = requested; resuelta = completed con su hora', () => {
    const pendiente = liberacionAFhir({ id: 'l1', citaId: 'a1', creadaEn: t });
    expect(pendiente).toMatchObject({
      status: 'requested',
      focus: { reference: 'Appointment/a1' },
    });
    expect(pendiente.code.coding[0]?.code).toBe('liberar-hora-avis');
    const resuelta = liberacionAFhir({ id: 'l1', citaId: 'a1', creadaEn: t, resueltaEn: t });
    expect(resuelta.status).toBe('completed');
    expect(resuelta.lastModified).toBe(t.toISOString());
  });
});

describe('Consent (baja de WhatsApp)', () => {
  it('queda inactivo y niega el uso del canal', () => {
    const c = bajaCanalAFhir({ id: 'c1', pacienteId: 'p1', registradoEn: t });
    expect(c.status).toBe('inactive');
    expect(c.provision.type).toBe('deny');
    expect(c.patient.reference).toBe('Patient/p1');
  });
});
