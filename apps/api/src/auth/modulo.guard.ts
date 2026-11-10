import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { puedeAcceder, type Modulo } from '@bh/shared';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { MODULO_KEY, type RequestConSesion } from './decoradores';

/** Aplica la matriz de permisos por módulo y deja rastro de cada denegación. */
@Injectable()
export class ModuloGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const modulo = this.reflector.getAllAndOverride<Modulo | undefined>(MODULO_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!modulo) return true;
    const req = ctx.switchToHttp().getRequest<RequestConSesion>();
    const sesion = req.sesion;
    if (sesion && puedeAcceder(sesion.roles, modulo)) return true;

    await this.auditoria
      .registrar({
        accion: 'acceso.denegado',
        recurso: `modulo:${modulo}`,
        ...(sesion ? { usuarioId: sesion.id } : {}),
        ip: req.ip,
      })
      // La denegación no debe fallar por un problema de auditoría.
      .catch(() => undefined);
    throw new ForbiddenException('Tu rol no tiene acceso a este módulo');
  }
}
