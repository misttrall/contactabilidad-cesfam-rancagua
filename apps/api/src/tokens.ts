/** Tokens de inyección explícitos (no dependemos de emitDecoratorMetadata, que Vitest/esbuild no emite). */
export const CONFIG = Symbol('CONFIG');
export const VERIFICADOR_TOKEN = Symbol('VERIFICADOR_TOKEN');
export const CANAL = Symbol('CANAL');
export const COLA_ENVIOS = Symbol('COLA_ENVIOS');
export const RELOJ = Symbol('RELOJ');
