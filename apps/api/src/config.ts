export const AMBIENTES = ['DEMO', 'QA', 'PRODUCCION'] as const;
export type Ambiente = (typeof AMBIENTES)[number];

export interface Config {
  ambiente: Ambiente;
  puerto: number;
  version: string;
  baseUrl: string;
  /** Orígenes permitidos por CORS (la web). */
  origenesWeb: string[];
  /** Clave AES-256 (32 bytes) para cifrar datos de contacto en la BD. */
  claveDatos: Buffer;
  /** Redis para la cola de envíos. Sin él, la cola corre en memoria (solo desarrollo y pruebas). */
  redisUrl: string | undefined;
  /** Cada cuántos ms se revisan los vencimientos de respuesta; 0 lo desactiva. */
  barridoMs: number;
  whatsapp: {
    /** simulador: no sale nada a internet. cloud: WhatsApp Business Platform (Cloud API). */
    modo: 'simulador' | 'cloud';
    token: string | undefined;
    phoneNumberId: string | undefined;
    /** Secreto de la app de Meta: verifica la firma X-Hub-Signature-256 del webhook. */
    appSecret: string | undefined;
    /** Token que Meta envía al registrar el webhook (GET de verificación). */
    verifyToken: string | undefined;
    apiVersion: string;
    plantillaConfirmacion: string;
    plantillaRecordatorio: string;
  };
  keycloak: {
    issuer: string;
    audience: string;
    /** Por defecto `${issuer}/protocol/openid-connect/certs`; útil si la API ve Keycloak por otra red. */
    jwksUrl: string;
  };
}

/** Lee y valida el entorno al arrancar: falla rápido si hay un valor inválido. */
export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const ambiente = (env.AMBIENTE ?? 'DEMO') as Ambiente;
  if (!AMBIENTES.includes(ambiente)) {
    throw new Error(`AMBIENTE inválido: "${env.AMBIENTE}". Valores: ${AMBIENTES.join(', ')}`);
  }
  const puerto = Number(env.API_PORT ?? 3000);
  if (!Number.isInteger(puerto) || puerto <= 0) {
    throw new Error(`API_PORT inválido: ${env.API_PORT}`);
  }
  const issuer = env.KEYCLOAK_ISSUER ?? 'http://localhost:8081/realms/businesshub';
  if (ambiente === 'PRODUCCION' && !issuer.startsWith('https://')) {
    throw new Error('En PRODUCCION KEYCLOAK_ISSUER debe usar https');
  }
  const claveDatos = leerClaveDatos(env, ambiente);
  const whatsapp = leerWhatsapp(env, ambiente);
  if (ambiente !== 'DEMO' && !env.REDIS_URL) {
    throw new Error(
      'REDIS_URL es obligatoria fuera de DEMO (la cola de envíos debe ser persistente)',
    );
  }
  const barridoMs = Number(env.BARRIDO_INTERVALO_MS ?? 300_000);
  if (!Number.isInteger(barridoMs) || barridoMs < 0) {
    throw new Error(`BARRIDO_INTERVALO_MS inválido: ${env.BARRIDO_INTERVALO_MS}`);
  }
  return {
    ambiente,
    claveDatos,
    redisUrl: env.REDIS_URL || undefined,
    barridoMs,
    whatsapp,
    puerto,
    version: env.npm_package_version ?? '0.2.0',
    baseUrl: env.PUBLIC_API_URL ?? `http://localhost:${puerto}`,
    origenesWeb: (env.WEB_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
    keycloak: {
      issuer,
      audience: env.KEYCLOAK_AUDIENCE ?? 'businesshub-api',
      jwksUrl: env.KEYCLOAK_JWKS_URL ?? `${issuer}/protocol/openid-connect/certs`,
    },
  };
}

/**
 * DATA_ENCRYPTION_KEY: 32 bytes en base64 (generar con: openssl rand -base64 32).
 * En DEMO hay una clave de desarrollo PÚBLICA (solo protege datos ficticios); en QA/PRODUCCION es
 * obligatoria y debe venir del gestor de secretos, nunca del repositorio.
 */
export const CLAVE_DEMO_PUBLICA = Buffer.alloc(32, 'demo-clave-publica-no-usar-en-prod');

function leerClaveDatos(env: NodeJS.ProcessEnv, ambiente: Ambiente): Buffer {
  const b64 = env.DATA_ENCRYPTION_KEY;
  if (!b64) {
    if (ambiente === 'DEMO') return CLAVE_DEMO_PUBLICA;
    throw new Error('DATA_ENCRYPTION_KEY es obligatoria fuera de DEMO');
  }
  const clave = Buffer.from(b64, 'base64');
  if (clave.length !== 32) throw new Error('DATA_ENCRYPTION_KEY debe ser de 32 bytes en base64');
  return clave;
}

function leerWhatsapp(env: NodeJS.ProcessEnv, ambiente: Ambiente): Config['whatsapp'] {
  const modo = env.WHATSAPP_MODO ?? 'simulador';
  if (modo !== 'simulador' && modo !== 'cloud') {
    throw new Error(`WHATSAPP_MODO inválido: "${modo}". Valores: simulador, cloud`);
  }
  if (ambiente === 'PRODUCCION' && modo !== 'cloud') {
    throw new Error('En PRODUCCION WHATSAPP_MODO debe ser cloud');
  }
  const w = {
    modo,
    token: env.WHATSAPP_TOKEN || undefined,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || undefined,
    appSecret: env.WHATSAPP_APP_SECRET || undefined,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || undefined,
    apiVersion: env.WHATSAPP_API_VERSION ?? 'v21.0',
    plantillaConfirmacion: env.WHATSAPP_PLANTILLA_CONFIRMACION ?? 'confirmacion_hora_v1',
    plantillaRecordatorio: env.WHATSAPP_PLANTILLA_RECORDATORIO ?? 'recordatorio_hora_v1',
  } as const;
  if (modo === 'cloud') {
    const faltan = (['token', 'phoneNumberId', 'appSecret', 'verifyToken'] as const).filter(
      (k) => !w[k],
    );
    if (faltan.length > 0) {
      throw new Error(
        `Con WHATSAPP_MODO=cloud faltan: ${faltan.map((k) => k).join(', ')} (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN)`,
      );
    }
  }
  return w;
}
