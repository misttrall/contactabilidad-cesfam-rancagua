/**
 * CapabilityStatement de la fachada FHIR (GET /fhir/R4/metadata).
 * Crece sprint a sprint: solo declarar lo que realmente está implementado.
 */
export interface CapabilityStatementOpciones {
  version: string;
  fecha: string; // ISO 8601
  baseUrl: string;
}

interface RecursoSoportado {
  type: string;
  interaction: ('read' | 'search-type')[];
}

/** S1: catálogos. S2: Appointment y Patient. S3: Task, Communication y AppointmentResponse (búsqueda por cita). */
export const RECURSOS_SOPORTADOS: RecursoSoportado[] = [
  { type: 'Organization', interaction: ['read', 'search-type'] },
  { type: 'Location', interaction: ['read', 'search-type'] },
  { type: 'Practitioner', interaction: ['read', 'search-type'] },
  { type: 'PractitionerRole', interaction: ['read', 'search-type'] },
  { type: 'CodeSystem', interaction: ['read'] },
  { type: 'Appointment', interaction: ['read', 'search-type'] },
  { type: 'Patient', interaction: ['read', 'search-type'] },
  { type: 'Task', interaction: ['search-type'] },
  { type: 'Communication', interaction: ['search-type'] },
  { type: 'AppointmentResponse', interaction: ['search-type'] },
];

export function construirCapabilityStatement(o: CapabilityStatementOpciones) {
  return {
    resourceType: 'CapabilityStatement',
    status: 'draft',
    date: o.fecha,
    kind: 'instance',
    software: { name: 'BusinessHub Salud', version: o.version },
    implementation: {
      description: 'BusinessHub Salud - Contactabilidad CESFAM Rancagua',
      url: o.baseUrl,
    },
    fhirVersion: '4.0.1',
    format: ['json'],
    rest: [
      {
        mode: 'server',
        security: {
          description:
            'OAuth 2.0 / OpenID Connect (Keycloak). Bearer token obligatorio salvo /metadata.',
        },
        resource: RECURSOS_SOPORTADOS.map((r) => ({
          type: r.type,
          interaction: r.interaction.map((code) => ({ code })),
        })),
      },
    ],
  } as const;
}
