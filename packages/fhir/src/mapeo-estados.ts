import type { EstadoCita } from '@bh/shared';

/**
 * Mapeo del estado de contactabilidad a FHIR R4 (ADR-001 §2.4).
 * El estado del proceso vive en `Task`; la agenda (`Appointment.status`) es de AVIS.
 *
 * Invariante RN-01: ningún estado de contactabilidad produce `Appointment.status = cancelled`.
 * La cancelación efectiva la decide AVIS; nosotros solo registramos la intención del paciente
 * (`AppointmentResponse.participantStatus = declined`) y generamos una tarea de liberación de hora.
 */
export type TaskStatusFhir = 'ready' | 'in-progress' | 'completed';
export type ParticipantStatusFhir = 'accepted' | 'declined';

export interface MapeoFhirEstado {
  taskStatus: TaskStatusFhir;
  /** Código en el CodeSystem local estado-contacto. */
  businessStatus: string;
  /** Siempre 'booked': nunca 'cancelled' (RN-01). */
  appointmentStatus: 'booked';
  appointmentResponse?: ParticipantStatusFhir;
}

export const MAPEO_ESTADO_FHIR: Record<EstadoCita, MapeoFhirEstado> = {
  sin_enviar: { taskStatus: 'ready', businessStatus: 'sin-enviar', appointmentStatus: 'booked' },
  enviado: { taskStatus: 'in-progress', businessStatus: 'enviado', appointmentStatus: 'booked' },
  confirmado: {
    taskStatus: 'completed',
    businessStatus: 'confirmado',
    appointmentStatus: 'booked',
    appointmentResponse: 'accepted',
  },
  sin_respuesta: {
    taskStatus: 'in-progress',
    businessStatus: 'sin-respuesta',
    appointmentStatus: 'booked',
  },
  cancelado: {
    taskStatus: 'completed',
    businessStatus: 'cancelado',
    appointmentStatus: 'booked',
    appointmentResponse: 'declined',
  },
};

/** Inversa para recibir estados FHIR (p. ej., webhook o intercambio con otro sistema). */
export function estadoDesdeBusinessStatus(code: string): EstadoCita | undefined {
  return (Object.keys(MAPEO_ESTADO_FHIR) as EstadoCita[]).find(
    (k) => MAPEO_ESTADO_FHIR[k].businessStatus === code,
  );
}
