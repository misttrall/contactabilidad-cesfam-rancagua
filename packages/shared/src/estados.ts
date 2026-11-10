/** Estados de contactabilidad de una cita (informe 4.3). Ver ADR-001 §2.4 para su mapeo FHIR. */
export const ESTADOS_CITA = [
  'sin_enviar',
  'enviado',
  'confirmado',
  'sin_respuesta',
  'cancelado',
] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];

export const SUBESTADOS_SIN_RESPUESTA = ['recado', 'no_ubicado'] as const;
export type SubestadoSinRespuesta = (typeof SUBESTADOS_SIN_RESPUESTA)[number];

export const RESULTADOS_LLAMADA = ['confirmado', 'recado', 'no_ubicado', 'cancelado'] as const;
export type ResultadoLlamada = (typeof RESULTADOS_LLAMADA)[number];

export const ETIQUETA_ESTADO: Record<EstadoCita, string> = {
  sin_enviar: 'Sin enviar',
  enviado: 'Enviado · esperando respuesta',
  confirmado: 'Confirmado',
  sin_respuesta: 'Sin respuesta · llamar',
  cancelado: 'Cancelado por paciente',
};

/**
 * RN-01: "Sin respuesta" NUNCA cancela una cita. Recado y No ubicado dejan la cita
 * en sin_respuesta conservando el subestado (corrige 6.10 del informe).
 */
export function estadoTrasLlamada(r: ResultadoLlamada): {
  estado: EstadoCita;
  subestado?: SubestadoSinRespuesta;
} {
  switch (r) {
    case 'confirmado':
      return { estado: 'confirmado' };
    case 'cancelado':
      return { estado: 'cancelado' };
    case 'recado':
      return { estado: 'sin_respuesta', subestado: 'recado' };
    case 'no_ubicado':
      return { estado: 'sin_respuesta', subestado: 'no_ubicado' };
  }
}

/** Transiciones permitidas (diagrama de estados, 8.4). Confirmado y cancelado son finales. */
const TRANSICIONES: Record<EstadoCita, readonly EstadoCita[]> = {
  sin_enviar: ['enviado', 'confirmado', 'sin_respuesta', 'cancelado'],
  enviado: ['confirmado', 'cancelado', 'sin_respuesta'],
  sin_respuesta: ['confirmado', 'cancelado', 'sin_respuesta'],
  confirmado: [],
  cancelado: [],
};

export function puedeTransitar(desde: EstadoCita, hasta: EstadoCita): boolean {
  return TRANSICIONES[desde].includes(hasta);
}

export const EDAD_ADULTO_MAYOR = 65;
export const esAdultoMayor = (edad: number): boolean => edad >= EDAD_ADULTO_MAYOR;

/** Pendiente por llamar = sin_respuesta, o enviado cuya espera ya venció (RN-05 ampliada). */
export function requiereLlamada(
  estado: EstadoCita,
  horasDesdeEnvio?: number,
  horasEspera = 24,
): boolean {
  return (
    estado === 'sin_respuesta' || (estado === 'enviado' && (horasDesdeEnvio ?? 0) >= horasEspera)
  );
}
