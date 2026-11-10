/**
 * URIs de sistemas de codificación y extensiones.
 * - Los sistemas locales (`LOCAL_*`) son nuestros y se publican como CodeSystem en `ig/`.
 * - `SISTEMA_RUN` es provisorio: confirmar contra CL Core al fijar la versión de la guía
 *   (ver `ig/versions.json` y ADR-001 §1).
 */
export const BASE_LOCAL = 'https://businesshub.cl/fhir';

export const LOCAL_MOTIVO_LLAMADA = `${BASE_LOCAL}/CodeSystem/motivo-llamada`;
export const LOCAL_RESULTADO_LLAMADA = `${BASE_LOCAL}/CodeSystem/resultado-llamada`;
export const LOCAL_TIPO_CITA = `${BASE_LOCAL}/CodeSystem/tipo-cita`;
export const LOCAL_ESTADO_CONTACTO = `${BASE_LOCAL}/CodeSystem/estado-contacto`;
export const LOCAL_CENTRO = `${BASE_LOCAL}/CodeSystem/centro`;

/** PROVISORIO: reemplazar por el sistema de identificación de RUN definido en CL Core. */
export const SISTEMA_RUN = 'https://hl7chile.cl/fhir/sid/run';

export const SISTEMA_TELECOM_WHATSAPP = `${BASE_LOCAL}/CodeSystem/medio-contacto`;
