export const AMBIENTES = ['DEMO', 'QA', 'PRODUCCION'] as const;
export type Ambiente = (typeof AMBIENTES)[number];

export interface Config {
  ambiente: Ambiente;
  puerto: number;
  version: string;
  baseUrl: string;
  /** Orígenes permitidos por CORS (la web). */
  origenesWeb: string[];
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
  return {
    ambiente,
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
