/**
 * CapabilityStatement de la fachada FHIR (GET /fhir/R4/metadata).
 * Crece sprint a sprint: solo declarar lo que realmente está implementado.
 */
export interface CapabilityStatementOpciones {
  version: string;
  fecha: string; // ISO 8601
  baseUrl: string;
}

const RECURSOS_S0: string[] = [];

export function construirCapabilityStatement(o: CapabilityStatementOpciones) {
  return {
    resourceType: 'CapabilityStatement',
    status: 'draft',
    date: o.fecha,
    kind: 'instance',
    software: { name: 'BusinessHub Salud', version: o.version },
    implementation: { description: 'BusinessHub Salud - Contactabilidad CESFAM Rancagua', url: o.baseUrl },
    fhirVersion: '4.0.1',
    format: ['json'],
    rest: [
      {
        mode: 'server',
        resource: RECURSOS_S0.map((type) => ({ type, interaction: [{ code: 'read' }] })),
      },
    ],
  } as const;
}
