import { ESTADOS_CITA, RESULTADOS_LLAMADA } from '@bh/shared';
import { describe, expect, it } from 'vitest';
import {
  bundleSearchset,
  codeSystemEstadoContacto,
  codeSystemMotivos,
  codeSystemResultadoLlamada,
  organizacionAFhir,
  practitionerAFhir,
  practitionerRoleAFhir,
  ubicacionAFhir,
} from './catalogos';
import { RECURSOS_SOPORTADOS } from './capability';

const centro = { id: 'c-1', codigo: 'CSC', nombre: 'CESFAM Centro (DEMO)', activo: true };

describe('Organization / Location', () => {
  it('comparten id y la Location apunta a su Organization', () => {
    const org = organizacionAFhir(centro);
    const loc = ubicacionAFhir(centro);
    expect(org.id).toBe(loc.id);
    expect(loc.managingOrganization.reference).toBe(`Organization/${org.id}`);
    expect(org.identifier[0]?.value).toBe('CSC');
  });
  it('un centro inactivo se refleja en ambos recursos', () => {
    const inactivo = { ...centro, activo: false };
    expect(organizacionAFhir(inactivo).active).toBe(false);
    expect(ubicacionAFhir(inactivo).status).toBe('inactive');
  });
});

describe('Practitioner / PractitionerRole', () => {
  const prof = {
    id: 'p-1',
    nombre: 'Dra. Demo Uno',
    especialidad: 'Medicina general',
    centroId: 'c-1',
    activo: true,
  };
  it('el rol enlaza profesional y centro', () => {
    const rol = practitionerRoleAFhir(prof);
    expect(rol.practitioner.reference).toBe('Practitioner/p-1');
    expect(rol.organization.reference).toBe('Organization/c-1');
    expect(rol.specialty?.[0]?.text).toBe('Medicina general');
    expect(practitionerAFhir(prof).name[0]?.text).toBe('Dra. Demo Uno');
  });
});

describe('CodeSystems locales', () => {
  it('el de resultado de llamada conserva Recado y No ubicado por separado', () => {
    const cs = codeSystemResultadoLlamada();
    expect(cs.count).toBe(RESULTADOS_LLAMADA.length);
    const codigos = cs.concept.map((c) => c.code);
    expect(codigos).toEqual(expect.arrayContaining(['recado', 'no_ubicado']));
  });
  it('el de estado de contacto cubre todos los estados', () => {
    expect(codeSystemEstadoContacto().count).toBe(ESTADOS_CITA.length);
  });
  it('el de motivos se genera desde el catálogo vigente', () => {
    const cs = codeSystemMotivos([{ codigo: 'SOL_HORA', descripcion: 'Solicitud de hora' }]);
    expect(cs.concept).toEqual([{ code: 'SOL_HORA', display: 'Solicitud de hora' }]);
    expect(cs.url).toContain('motivo-llamada');
  });
});

describe('Bundle y CapabilityStatement', () => {
  it('arma un searchset con fullUrl', () => {
    const b = bundleSearchset([organizacionAFhir(centro)], 'http://x/fhir/R4');
    expect(b.total).toBe(1);
    expect(b.entry[0]?.fullUrl).toBe('http://x/fhir/R4/Organization/c-1');
  });
  it('solo declara recursos implementados (no Task ni AppointmentResponse todavía)', () => {
    const tipos = RECURSOS_SOPORTADOS.map((r) => r.type);
    expect(tipos).not.toContain('Task');
    expect(tipos).toContain('Organization');
  });
});
