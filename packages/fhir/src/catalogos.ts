import {
  LOCAL_CENTRO,
  LOCAL_ESTADO_CONTACTO,
  LOCAL_MOTIVO_LLAMADA,
  LOCAL_RESULTADO_LLAMADA,
  LOCAL_TIPO_CITA,
} from './sistemas';
import { MAPEO_ESTADO_FHIR } from './mapeo-estados';
import { ESTADOS_CITA, ETIQUETA_ESTADO, RESULTADOS_LLAMADA } from '@bh/shared';

// ---------------------------------------------------------------- Tipos mínimos (subconjunto R4)

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}

export interface FhirOrganization {
  resourceType: 'Organization';
  id: string;
  active: boolean;
  identifier: { system: string; value: string }[];
  name: string;
}

export interface FhirLocation {
  resourceType: 'Location';
  id: string;
  status: 'active' | 'inactive';
  name: string;
  identifier: { system: string; value: string }[];
  managingOrganization: { reference: string; display: string };
}

export interface FhirPractitioner {
  resourceType: 'Practitioner';
  id: string;
  active: boolean;
  name: { text: string }[];
}

export interface FhirPractitionerRole {
  resourceType: 'PractitionerRole';
  id: string;
  active: boolean;
  practitioner: { reference: string };
  organization: { reference: string };
  specialty?: { text: string }[];
}

export interface FhirCodeSystem {
  resourceType: 'CodeSystem';
  id: string;
  url: string;
  version: string;
  name: string;
  title: string;
  status: 'active' | 'draft';
  content: 'complete';
  count: number;
  concept: { code: string; display: string }[];
}

export interface FhirBundle<T> {
  resourceType: 'Bundle';
  type: 'searchset';
  total: number;
  entry: { fullUrl: string; resource: T }[];
}

export interface FhirOperationOutcome {
  resourceType: 'OperationOutcome';
  issue: { severity: 'error' | 'warning' | 'information'; code: string; diagnostics: string }[];
}

// ---------------------------------------------------------------- Dominio -> FHIR

export interface CentroDominio {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}

/**
 * NOTA: CL Core identifica establecimientos por código DEIS. El MVP usa un código local
 * (`LOCAL_CENTRO`) hasta confirmar con el Cesfam el DEIS de cada centro (ver PLAN_MVP §7).
 */
export function organizacionAFhir(c: CentroDominio): FhirOrganization {
  return {
    resourceType: 'Organization',
    id: c.id,
    active: c.activo,
    identifier: [{ system: LOCAL_CENTRO, value: c.codigo }],
    name: c.nombre,
  };
}

/** Cada Cesfam es a la vez Organization (quien presta) y Location (donde se atiende). */
export function ubicacionAFhir(c: CentroDominio): FhirLocation {
  return {
    resourceType: 'Location',
    id: c.id,
    status: c.activo ? 'active' : 'inactive',
    name: c.nombre,
    identifier: [{ system: LOCAL_CENTRO, value: c.codigo }],
    managingOrganization: { reference: `Organization/${c.id}`, display: c.nombre },
  };
}

export interface ProfesionalDominio {
  id: string;
  nombre: string;
  especialidad?: string | null;
  centroId: string;
  activo: boolean;
}

export function practitionerAFhir(p: ProfesionalDominio): FhirPractitioner {
  return { resourceType: 'Practitioner', id: p.id, active: p.activo, name: [{ text: p.nombre }] };
}

export function practitionerRoleAFhir(p: ProfesionalDominio): FhirPractitionerRole {
  return {
    resourceType: 'PractitionerRole',
    id: p.id,
    active: p.activo,
    practitioner: { reference: `Practitioner/${p.id}` },
    organization: { reference: `Organization/${p.centroId}` },
    ...(p.especialidad ? { specialty: [{ text: p.especialidad }] } : {}),
  };
}

// ---------------------------------------------------------------- CodeSystems locales

export const VERSION_CODESYSTEMS = '0.2.0';

function codeSystem(
  id: string,
  url: string,
  title: string,
  concept: { code: string; display: string }[],
): FhirCodeSystem {
  return {
    resourceType: 'CodeSystem',
    id,
    url,
    version: VERSION_CODESYSTEMS,
    name: id.replace(/-/g, '_'),
    title,
    status: 'draft',
    content: 'complete',
    count: concept.length,
    concept,
  };
}

export interface MotivoDominio {
  codigo: string;
  descripcion: string;
}

/** El catálogo de motivos es editable por el administrador: el CodeSystem se genera desde la BD. */
export function codeSystemMotivos(motivos: MotivoDominio[]): FhirCodeSystem {
  return codeSystem(
    'motivo-llamada',
    LOCAL_MOTIVO_LLAMADA,
    'Motivos de llamada entrante',
    motivos.map((m) => ({ code: m.codigo, display: m.descripcion })),
  );
}

const ETIQUETA_RESULTADO: Record<(typeof RESULTADOS_LLAMADA)[number], string> = {
  confirmado: 'Confirmado (asistirá)',
  recado: 'Recado dejado',
  no_ubicado: 'No ubicado',
  cancelado: 'Cancelado por el paciente',
};

export function codeSystemResultadoLlamada(): FhirCodeSystem {
  return codeSystem(
    'resultado-llamada',
    LOCAL_RESULTADO_LLAMADA,
    'Resultado de una llamada saliente',
    RESULTADOS_LLAMADA.map((r) => ({ code: r, display: ETIQUETA_RESULTADO[r] })),
  );
}

export function codeSystemTipoCita(): FhirCodeSystem {
  return codeSystem('tipo-cita', LOCAL_TIPO_CITA, 'Tipo de cita', [
    { code: 'cronico', display: 'Control crónico' },
    { code: 'morbilidad', display: 'Morbilidad' },
  ]);
}

export function codeSystemEstadoContacto(): FhirCodeSystem {
  return codeSystem(
    'estado-contacto',
    LOCAL_ESTADO_CONTACTO,
    'Estado de contactabilidad de la cita',
    ESTADOS_CITA.map((e) => ({
      code: MAPEO_ESTADO_FHIR[e].businessStatus,
      display: ETIQUETA_ESTADO[e],
    })),
  );
}

/** Ids de CodeSystem que la API sirve de forma estática. */
export const CODESYSTEMS_ESTATICOS: Record<string, () => FhirCodeSystem> = {
  'resultado-llamada': codeSystemResultadoLlamada,
  'tipo-cita': codeSystemTipoCita,
  'estado-contacto': codeSystemEstadoContacto,
};

// ---------------------------------------------------------------- Bundle y errores

export function bundleSearchset<T extends { resourceType: string; id?: string | undefined }>(
  recursos: T[],
  baseUrl: string,
): FhirBundle<T> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: recursos.length,
    entry: recursos.map((r) => ({
      fullUrl: `${baseUrl}/${r.resourceType}/${r.id ?? ''}`,
      resource: r,
    })),
  };
}

export function operationOutcome(
  severity: 'error' | 'warning' | 'information',
  code: string,
  diagnostics: string,
): FhirOperationOutcome {
  return { resourceType: 'OperationOutcome', issue: [{ severity, code, diagnostics }] };
}
