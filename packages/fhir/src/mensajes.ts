import { BASE_LOCAL, LOCAL_MOTIVO_LLAMADA, LOCAL_RESULTADO_LLAMADA } from './sistemas';

/**
 * Mapeo de la mensajería (S3) a FHIR R4. Ver ADR-001 §2.4:
 *   Mensaje          -> Communication        (medio: WhatsApp)
 *   Respuesta Sí/No  -> AppointmentResponse  (accepted / declined)
 *   Liberar en AVIS  -> Task                 (código local `liberar-hora-avis`)
 *   Baja del canal   -> Consent              (inactive)
 * Los mensajes NO se guardan con texto, así que Communication no lleva `payload`.
 */

export const LOCAL_TIPO_MENSAJE = `${BASE_LOCAL}/CodeSystem/tipo-mensaje`;
export const LOCAL_MEDIO_CONTACTO = `${BASE_LOCAL}/CodeSystem/medio-contacto`;
export const LOCAL_TAREA = `${BASE_LOCAL}/CodeSystem/tarea`;

export type EstadoMensajeDominio = 'en_cola' | 'enviado' | 'entregado' | 'leido' | 'fallido';

export interface FhirCommunication {
  resourceType: 'Communication';
  id: string;
  status: 'preparation' | 'in-progress' | 'completed' | 'not-done';
  statusReason?: { text: string };
  medium: { coding: { system: string; code: string; display: string }[] }[];
  topic: { coding: { system: string; code: string }[] };
  subject: { reference: string };
  about: { reference: string }[];
  sent?: string;
  received?: string;
}

const ESTADO_COMMUNICATION: Record<EstadoMensajeDominio, FhirCommunication['status']> = {
  en_cola: 'preparation',
  enviado: 'in-progress',
  entregado: 'completed',
  leido: 'completed',
  fallido: 'not-done',
};

export interface MensajeDominio {
  id: string;
  citaId: string;
  pacienteId: string;
  tipo: 'confirmacion' | 'recordatorio' | 'reagendamiento';
  estado: EstadoMensajeDominio;
  errorCodigo?: string | null | undefined;
  enviadoEn?: Date | null | undefined;
  entregadoEn?: Date | null | undefined;
}

export function mensajeAFhir(m: MensajeDominio): FhirCommunication {
  return {
    resourceType: 'Communication',
    id: m.id,
    status: ESTADO_COMMUNICATION[m.estado],
    // Solo el código de error del proveedor: nunca contenido ni teléfono.
    ...(m.estado === 'fallido' && m.errorCodigo
      ? { statusReason: { text: `error ${m.errorCodigo}` } }
      : {}),
    medium: [{ coding: [{ system: LOCAL_MEDIO_CONTACTO, code: 'whatsapp', display: 'WhatsApp' }] }],
    topic: { coding: [{ system: LOCAL_TIPO_MENSAJE, code: m.tipo }] },
    subject: { reference: `Patient/${m.pacienteId}` },
    about: [{ reference: `Appointment/${m.citaId}` }],
    ...(m.enviadoEn ? { sent: m.enviadoEn.toISOString() } : {}),
    ...(m.entregadoEn ? { received: m.entregadoEn.toISOString() } : {}),
  };
}

export interface FhirAppointmentResponse {
  resourceType: 'AppointmentResponse';
  id: string;
  appointment: { reference: string };
  actor: { reference: string };
  participantStatus: 'accepted' | 'declined';
  start?: string;
}

/** Solo existe cuando el paciente respondió: «Sí» -> accepted, «No» -> declined. */
export function respuestaCitaAFhir(t: {
  id: string;
  citaId: string;
  pacienteId: string;
  respuesta: 'si' | 'no';
  respondidoEn?: Date | null | undefined;
}): FhirAppointmentResponse {
  return {
    resourceType: 'AppointmentResponse',
    id: t.id,
    appointment: { reference: `Appointment/${t.citaId}` },
    actor: { reference: `Patient/${t.pacienteId}` },
    participantStatus: t.respuesta === 'si' ? 'accepted' : 'declined',
    ...(t.respondidoEn ? { start: t.respondidoEn.toISOString() } : {}),
  };
}

export interface FhirTaskLiberacion {
  resourceType: 'Task';
  id: string;
  status: 'requested' | 'completed';
  intent: 'order';
  code: { coding: { system: string; code: string; display: string }[] };
  focus: { reference: string };
  authoredOn: string;
  lastModified?: string;
}

/**
 * La agenda es de AVIS: cuando el paciente dice «No», este sistema NO cancela la cita; deja una
 * tarea «liberar hora en AVIS» pendiente hasta que una persona la resuelva.
 */
export function liberacionAFhir(l: {
  id: string;
  citaId: string;
  creadaEn: Date;
  resueltaEn?: Date | null | undefined;
}): FhirTaskLiberacion {
  return {
    resourceType: 'Task',
    id: l.id,
    status: l.resueltaEn ? 'completed' : 'requested',
    intent: 'order',
    code: {
      coding: [{ system: LOCAL_TAREA, code: 'liberar-hora-avis', display: 'Liberar hora en AVIS' }],
    },
    focus: { reference: `Appointment/${l.citaId}` },
    authoredOn: l.creadaEn.toISOString(),
    ...(l.resueltaEn ? { lastModified: l.resueltaEn.toISOString() } : {}),
  };
}

export interface FhirConsent {
  resourceType: 'Consent';
  id: string;
  status: 'inactive';
  scope: { coding: { system: string; code: string }[] };
  category: { coding: { system: string; code: string }[] }[];
  patient: { reference: string };
  dateTime: string;
  /** FHIR exige `policy` o `policyRule` (ppc-1). */
  policyRule: { text: string };
  provision: { type: 'deny'; purpose: { system: string; code: string }[] };
}

/** Baja del canal WhatsApp (el paciente pidió no recibir más mensajes). */
export function bajaCanalAFhir(c: {
  id: string;
  pacienteId: string;
  registradoEn: Date;
}): FhirConsent {
  return {
    resourceType: 'Consent',
    id: c.id,
    status: 'inactive',
    scope: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' },
      ],
    },
    category: [{ coding: [{ system: 'http://loinc.org', code: '59284-0' }] }],
    patient: { reference: `Patient/${c.pacienteId}` },
    dateTime: c.registradoEn.toISOString(),
    policyRule: { text: 'Baja del canal WhatsApp solicitada por el titular (Ley 21.719)' },
    provision: {
      type: 'deny',
      purpose: [{ system: LOCAL_MEDIO_CONTACTO, code: 'whatsapp' }],
    },
  };
}

// ---------------------------------------------------------------------- llamadas telefónicas (S4)

export interface FhirCommunicationLlamada {
  resourceType: 'Communication';
  id: string;
  status: 'completed';
  medium: { coding: { system: string; code: string; display: string }[] }[];
  topic: { coding: { system: string; code: string }[] };
  subject?: { reference: string };
  sender: { reference: string };
  recipient: { reference: string }[];
  about?: { reference: string }[];
  sent?: string;
  received?: string;
}

export interface LlamadaDominio {
  id: string;
  direccion: 'entrante' | 'saliente';
  centroId: string;
  pacienteId?: string | null | undefined;
  /** Solo en llamadas salientes: la cita que se intentaba confirmar. */
  citaId?: string | null | undefined;
  /** Código del motivo (entrante) o del resultado (saliente). */
  codigo: string;
  creadaEn: Date;
}

/**
 * Llamada telefónica como Communication. Entrante: el paciente es el remitente y el centro el
 * destinatario; saliente, al revés. Una entrante sin paciente cargado no lleva `subject`.
 * No incluye observaciones (texto libre que podría contener datos personales).
 */
export function llamadaAFhir(l: LlamadaDominio): FhirCommunicationLlamada {
  const centro = { reference: `Organization/${l.centroId}` };
  const paciente = l.pacienteId ? { reference: `Patient/${l.pacienteId}` } : undefined;
  const entrante = l.direccion === 'entrante';
  const sistema = entrante ? LOCAL_MOTIVO_LLAMADA : LOCAL_RESULTADO_LLAMADA;
  const instante = l.creadaEn.toISOString();
  return {
    resourceType: 'Communication',
    id: l.id,
    status: 'completed',
    medium: [{ coding: [{ system: LOCAL_MEDIO_CONTACTO, code: 'telefono', display: 'Teléfono' }] }],
    topic: { coding: [{ system: sistema, code: l.codigo }] },
    ...(paciente ? { subject: paciente } : {}),
    // Sin paciente identificado, el remitente de una llamada entrante es desconocido: se omite.
    sender: entrante ? (paciente ?? centro) : centro,
    recipient: entrante ? [centro] : paciente ? [paciente] : [],
    ...(l.citaId ? { about: [{ reference: `Appointment/${l.citaId}` }] } : {}),
    ...(entrante ? { received: instante } : { sent: instante }),
  };
}
