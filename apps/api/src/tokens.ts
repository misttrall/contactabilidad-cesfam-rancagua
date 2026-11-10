/** Tokens de inyección explícitos (no dependemos de emitDecoratorMetadata, que Vitest/esbuild no emite). */
export const CONFIG = Symbol('CONFIG');
export const VERIFICADOR_TOKEN = Symbol('VERIFICADOR_TOKEN');
