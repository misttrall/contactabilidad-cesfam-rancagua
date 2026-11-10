import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Modulo, SesionUsuario } from '@bh/shared';
import type { Request } from 'express';

export const PUBLICO_KEY = 'publico';
export const MODULO_KEY = 'modulo';

/** Ruta sin autenticación (solo /health y /fhir/R4/metadata). */
export const Publico = () => SetMetadata(PUBLICO_KEY, true);

/** Exige que el rol del usuario tenga acceso al módulo (matriz de permisos de @bh/shared). */
export const RequiereModulo = (modulo: Modulo) => SetMetadata(MODULO_KEY, modulo);

export type RequestConSesion = Request & { sesion?: SesionUsuario };

/** Inyecta la sesión ya validada por AuthGuard. */
export const Sesion = createParamDecorator((_: unknown, ctx: ExecutionContext): SesionUsuario => {
  const req = ctx.switchToHttp().getRequest<RequestConSesion>();
  if (!req.sesion) throw new Error('Sesion solicitada en una ruta sin autenticación');
  return req.sesion;
});
