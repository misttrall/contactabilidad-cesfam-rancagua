import { createHash, randomUUID } from 'node:crypto';
import { claveCita, instanteSantiago, type FilaCarga } from '@bh/shared';
import { MAPEO_ESTADO_FHIR } from './mapeo-estados';
import { pacienteAFhir, type FhirPatient } from './recursos';
import { BASE_LOCAL, LOCAL_ESTADO_CONTACTO, LOCAL_TIPO_CITA, SISTEMA_RUN } from './sistemas';

export const LOCAL_CITA = `${BASE_LOCAL}/sid/cita`;

export interface FhirAppointment {
  resourceType: 'Appointment';
  id?: string;
  identifier?: { system: string; value: string }[];
  /** Siempre 'booked': el estado de contactabilidad NO cancela la agenda (RN-01, ADR-001 §2.4). */
  status: 'booked';
  serviceType: { text: string }[];
  appointmentType: { coding: { system: string; code: string }[] };
  start: string;
  participant: {
    actor: { reference?: string; display?: string };
    status: 'needs-action' | 'accepted' | 'declined';
  }[];
}

export interface FhirTask {
  resourceType: 'Task';
  id?: string;
  status: 'ready' | 'in-progress' | 'completed';
  intent: 'order';
  businessStatus: { coding: { system: string; code: string }[] };
  focus: { reference: string };
}

export interface CitaDominio {
  id: string;
  centroId: string;
  pacienteId: string;
  profesionalId?: string | null | undefined;
  profesionalNombre: string;
  /** AAAA-MM-DD */
  fecha: string;
  hora: string;
  prestacion: string;
  tipo: 'cronico' | 'morbilidad';
}

/**
 * Clave pública estable de una cita para deduplicar entre sistemas. Es un hash: el identificador
 * no debe llevar el RUT en claro.
 */
export function identificadorCita(
  f: Pick<FilaCarga, 'rut' | 'fecha' | 'hora' | 'profesional'>,
  centroId: string,
) {
  return createHash('sha256')
    .update(`${centroId}|${claveCita(f)}`)
    .digest('hex')
    .slice(0, 32);
}

export function citaAFhir(c: CitaDominio): FhirAppointment {
  return {
    resourceType: 'Appointment',
    id: c.id,
    status: 'booked',
    serviceType: [{ text: c.prestacion }],
    appointmentType: { coding: [{ system: LOCAL_TIPO_CITA, code: c.tipo }] },
    start: instanteSantiago(c.fecha, c.hora),
    participant: [
      { actor: { reference: `Patient/${c.pacienteId}` }, status: 'needs-action' },
      { actor: { reference: `Location/${c.centroId}` }, status: 'accepted' },
      {
        actor: c.profesionalId
          ? { reference: `Practitioner/${c.profesionalId}`, display: c.profesionalNombre }
          : { display: c.profesionalNombre },
        status: 'accepted',
      },
    ],
  };
}

export function tareaContactoAFhir(
  t: { id?: string; estado: keyof typeof MAPEO_ESTADO_FHIR },
  citaId: string,
): FhirTask {
  const m = MAPEO_ESTADO_FHIR[t.estado];
  return {
    resourceType: 'Task',
    ...(t.id ? { id: t.id } : {}),
    status: m.taskStatus,
    intent: 'order',
    businessStatus: { coding: [{ system: LOCAL_ESTADO_CONTACTO, code: m.businessStatus }] },
    focus: { reference: `Appointment/${citaId}` },
  };
}

export interface BundleTransaction {
  resourceType: 'Bundle';
  type: 'transaction';
  entry: {
    fullUrl: string;
    resource: FhirPatient | FhirAppointment | FhirTask;
    request: { method: 'PUT' | 'POST'; url: string; ifNoneExist?: string };
  }[];
}

/**
 * Representación de intercambio de una carga como Bundle transaction FHIR (ADR-001 §2.3):
 * Patient (actualización condicional por RUN), Appointment (creación condicional por identificador)
 * y Task `sin-enviar`. Las referencias internas usan `urn:uuid`. Es lo que un adaptador de salida
 * hacia AVIS u otro sistema FHIR enviaría; la fuente de verdad en el MVP es la base relacional.
 */
export function construirBundleCarga(filas: FilaCarga[], centroId: string): BundleTransaction {
  const entry: BundleTransaction['entry'] = [];
  const urnPaciente = new Map<string, string>();

  for (const f of filas) {
    if (!urnPaciente.has(f.rut)) {
      const urn = `urn:uuid:${randomUUID()}`;
      urnPaciente.set(f.rut, urn);
      entry.push({
        fullUrl: urn,
        resource: pacienteAFhir({
          rut: f.rut,
          nombre: f.paciente,
          telefono: f.telefono,
          sexo: f.sexo,
          fechaNacimiento: f.fechaNacimiento,
        }),
        request: { method: 'PUT', url: `Patient?identifier=${SISTEMA_RUN}|${f.rut}` },
      });
    }
    const urnCita = `urn:uuid:${randomUUID()}`;
    const clave = identificadorCita(f, centroId);
    const cita = citaAFhir({
      id: '',
      centroId,
      pacienteId: '',
      profesionalNombre: f.profesional,
      fecha: f.fecha,
      hora: f.hora,
      prestacion: f.prestacion,
      tipo: f.tipo,
    });
    // En el bundle no hay ids definitivos: referencias por urn:uuid y sin id propio.
    delete cita.id;
    cita.identifier = [{ system: LOCAL_CITA, value: clave }];
    cita.participant[0] = { actor: { reference: urnPaciente.get(f.rut)! }, status: 'needs-action' };
    cita.participant[1] = { actor: { reference: `Location/${centroId}` }, status: 'accepted' };
    entry.push({
      fullUrl: urnCita,
      resource: cita,
      request: {
        method: 'POST',
        url: 'Appointment',
        ifNoneExist: `identifier=${LOCAL_CITA}|${clave}`,
      },
    });
    const tarea = tareaContactoAFhir({ estado: 'sin_enviar' }, '');
    tarea.focus = { reference: urnCita };
    entry.push({
      fullUrl: `urn:uuid:${randomUUID()}`,
      resource: tarea,
      request: { method: 'POST', url: 'Task' },
    });
  }
  return { resourceType: 'Bundle', type: 'transaction', entry };
}
