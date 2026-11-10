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
  return {
    ambiente,
    claveDatos,
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
