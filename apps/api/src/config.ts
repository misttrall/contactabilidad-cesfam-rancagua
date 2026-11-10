export const AMBIENTES = ['DEMO', 'QA', 'PRODUCCION'] as const;
export type Ambiente = (typeof AMBIENTES)[number];

export interface Config {
  ambiente: Ambiente;
  puerto: number;
  version: string;
  baseUrl: string;
}

/** Lee y valida el entorno al arrancar: falla rápido si hay un valor inválido. */
export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const ambiente = (env.AMBIENTE ?? 'DEMO') as Ambiente;
  if (!AMBIENTES.includes(ambiente)) {
    throw new Error(`AMBIENTE inválido: "${env.AMBIENTE}". Valores: ${AMBIENTES.join(', ')}`);
  }
  const puerto = Number(env.API_PORT ?? 3000);
  if (!Number.isInteger(puerto) || puerto <= 0) throw new Error(`API_PORT inválido: ${env.API_PORT}`);
  return {
    ambiente,
    puerto,
    version: env.npm_package_version ?? '0.2.0',
    baseUrl: env.PUBLIC_API_URL ?? `http://localhost:${puerto}`,
  };
}
