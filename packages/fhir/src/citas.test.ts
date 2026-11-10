import { calcularDv, procesarMatriz, type FilaCarga } from '@bh/shared';
import { describe, expect, it } from 'vitest';
import { RECURSOS_SOPORTADOS } from './capability';
import { citaAFhir, construirBundleCarga, identificadorCita, tareaContactoAFhir } from './citas';

const rut = (n: number) => `${n}-${calcularDv(String(n))}`;
const fila = (i: number, extra: Partial<FilaCarga> = {}): FilaCarga => ({
  paciente: `Paciente Demo ${i}`,
  rut: rut(1_000_000 + i),
  telefono: `+5690000000${i}`,
  fecha: '2026-11-20',
  hora: '09:30',
  profesional: 'Dra. Demo Uno',
  prestacion: 'Control crónico',
  tipo: 'cronico',
  ...extra,
});

describe('Appointment', () => {
  const cita = {
    id: 'a1',
    centroId: 'c1',
    pacienteId: 'p1',
    profesionalId: 'pr1',
    profesionalNombre: 'Dra. Demo Uno',
    fecha: '2026-06-15',
    hora: '09:30',
    prestacion: 'Control crónico',
    tipo: 'cronico' as const,
  };
  it('RN-01: siempre queda "booked" y la hora lleva el offset real de Chile', () => {
    const a = citaAFhir(cita);
    expect(a.status).toBe('booked');
    expect(a.start).toBe('2026-06-15T09:30:00-04:00'); // invierno
    expect(citaAFhir({ ...cita, fecha: '2026-11-20' }).start).toBe('2026-11-20T09:30:00-03:00'); // verano
  });
  it('referencia paciente, centro y profesional', () => {
    const refs = citaAFhir(cita).participant.map((p) => p.actor.reference);
    expect(refs).toEqual(['Patient/p1', 'Location/c1', 'Practitioner/pr1']);
  });
  it('si el profesional no está en el catálogo se conserva su nombre', () => {
    const p = citaAFhir({ ...cita, profesionalId: null }).participant[2];
    expect(p?.actor).toEqual({ display: 'Dra. Demo Uno' });
  });
});

describe('Task de contacto', () => {
  it('sin_enviar es "ready" y apunta a su cita', () => {
    const t = tareaContactoAFhir({ estado: 'sin_enviar' }, 'a1');
    expect(t).toMatchObject({ status: 'ready', focus: { reference: 'Appointment/a1' } });
    expect(t.businessStatus.coding[0]?.code).toBe('sin-enviar');
  });
});

describe('Bundle transaction de una carga', () => {
  const filas = [fila(1), fila(2), fila(3, { rut: fila(1).rut, hora: '10:00' })]; // el paciente 1 tiene 2 citas
  const b = construirBundleCarga(filas, 'c1');
  const tipos = b.entry.map((e) => e.resource.resourceType);

  it('un Patient por RUN, y un Appointment y un Task por cita', () => {
    expect(b.type).toBe('transaction');
    expect(tipos.filter((t) => t === 'Patient')).toHaveLength(2);
    expect(tipos.filter((t) => t === 'Appointment')).toHaveLength(3);
    expect(tipos.filter((t) => t === 'Task')).toHaveLength(3);
  });
  it('el Patient se actualiza de forma condicional por RUN y el Appointment se crea condicional', () => {
    const p = b.entry.find((e) => e.resource.resourceType === 'Patient')!;
    expect(p.request.method).toBe('PUT');
    expect(p.request.url).toContain('Patient?identifier=');
    const a = b.entry.find((e) => e.resource.resourceType === 'Appointment')!;
    expect(a.request.ifNoneExist).toMatch(/^identifier=.+\|[0-9a-f]{32}$/);
  });
  it('todas las referencias urn:uuid apuntan a una entrada del mismo bundle', () => {
    const urls = new Set(b.entry.map((e) => e.fullUrl));
    const refs = JSON.stringify(b.entry.map((e) => e.resource)).match(/urn:uuid:[0-9a-f-]+/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(urls.has(r), r).toBe(true);
  });
  it('los Appointment no llevan el RUT en el identificador (solo un hash)', () => {
    const citas = b.entry.filter((e) => e.resource.resourceType === 'Appointment');
    for (const e of citas) {
      expect(JSON.stringify(e.resource)).not.toContain(String(1_000_001));
      expect(e.request.ifNoneExist).not.toContain(String(1_000_001));
    }
  });
  it('el identificador de cita es estable y distingue centro, hora y profesional', () => {
    const f = fila(1);
    expect(identificadorCita(f, 'c1')).toBe(identificadorCita({ ...f }, 'c1'));
    expect(identificadorCita(f, 'c1')).not.toBe(identificadorCita(f, 'c2'));
    expect(identificadorCita(f, 'c1')).not.toBe(identificadorCita({ ...f, hora: '10:00' }, 'c1'));
  });
  it('convierte exactamente lo que valida la planilla', () => {
    const enc = [
      'Paciente',
      'RUT',
      'Teléfono',
      'Fecha',
      'Hora',
      'Profesional',
      'Prestación',
      'Tipo',
    ];
    const r = procesarMatriz(
      [
        enc,
        [
          'Paciente Demo 9',
          rut(1_000_009),
          '912345678',
          '20-11-2026',
          '09:00',
          'Dr. X',
          'Control',
          'Crónico',
        ],
      ],
      { excluirMorbilidad: true },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(construirBundleCarga(r.validas, 'c1').entry).toHaveLength(3);
  });
});

describe('CapabilityStatement', () => {
  it('declara lo implementado, pero no recursos aún no implementados', () => {
    const tipos = RECURSOS_SOPORTADOS.map((r) => r.type);
    expect(tipos).toEqual(
      expect.arrayContaining([
        'Appointment',
        'Patient',
        'Organization',
        'Task',
        'Communication',
        'AppointmentResponse',
      ]),
    );
    expect(tipos).not.toContain('CommunicationRequest');
    expect(tipos).not.toContain('Consent');
  });
});
