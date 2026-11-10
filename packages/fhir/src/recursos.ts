import { enmascararTelefono, normalizarRut } from '@bh/shared';
import { SISTEMA_RUN } from './sistemas';

/** Tipos mínimos (subconjunto de FHIR R4) para no depender aún de @types/fhir. */
export interface FhirPatient {
  resourceType: 'Patient';
  id?: string;
  identifier: { system: string; value: string }[];
  name: { use?: 'official'; text: string }[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  telecom?: { system: 'phone'; value: string; use?: 'mobile' }[];
}

export interface PacienteDominio {
  rut: string;
  nombre: string;
  sexo?: 'M' | 'F' | null | undefined;
  telefono?: string | null | undefined;
  /** AAAA-MM-DD */
  fechaNacimiento?: string | null | undefined;
}

/** Dominio -> Patient. Lanza si el RUT no es válido (se valida antes en la carga). */
export function pacienteAFhir(p: PacienteDominio, id?: string): FhirPatient {
  const rut = normalizarRut(p.rut);
  if (!rut) throw new Error('RUT no válido: no se puede emitir Patient');
  return {
    resourceType: 'Patient',
    ...(id ? { id } : {}),
    identifier: [{ system: SISTEMA_RUN, value: rut }],
    name: [{ use: 'official', text: p.nombre }],
    ...(p.sexo ? { gender: p.sexo === 'M' ? ('male' as const) : ('female' as const) } : {}),
    ...(p.fechaNacimiento ? { birthDate: p.fechaNacimiento } : {}),
    ...(p.telefono
      ? { telecom: [{ system: 'phone' as const, value: p.telefono, use: 'mobile' as const }] }
      : {}),
  };
}

/** Versión para logs: nunca emitir datos sensibles completos. */
export function resumenParaLog(p: FhirPatient): string {
  const tel = p.telecom?.[0]?.value;
  return `Patient/${p.id ?? '?'} tel=${tel ? enmascararTelefono(tel) : '-'}`;
}
