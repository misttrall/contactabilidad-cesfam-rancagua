import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { rolPrincipal, type SesionUsuario } from '@bh/shared';
import type { JWTPayload } from 'jose';
import { UsuarioActivoService } from '../usuarios/usuario-activo.service';
import { VERIFICADOR_TOKEN } from '../tokens';
import { PUBLICO_KEY, type RequestConSesion } from './decoradores';
import type { VerificadorToken } from './verificador';

/** Construye la sesión a partir de los claims de Keycloak. */
export function sesionDesdeToken(p: JWTPayload): SesionUsuario {
  const realm = p['realm_access'] as { roles?: unknown } | undefined;
  const roles = Array.isArray(realm?.roles)
    ? realm.roles.filter((r): r is string => typeof r === 'string')
    : [];
  const centro = p['centro_id'];
  const nombre = p['name'] ?? p['preferred_username'] ?? 'Usuario';
  return {
    id: String(p.sub),
    nombre: String(nombre),
    roles,
    centroId: typeof centro === 'string' && centro !== '' ? centro : undefined,
  };
}

/**
 * Guard global: exige Bearer válido en toda ruta salvo @Publico().
 * Además, un token sin ningún rol del sistema se rechaza (403): estar autenticado en Keycloak
 * no basta, hay que ser funcionaria, encargado o administrador.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(VERIFICADOR_TOKEN) private readonly verificador: VerificadorToken,
    @Inject(UsuarioActivoService) private readonly activos: UsuarioActivoService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(PUBLICO_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (publico) return true;

    const req = ctx.switchToHttp().getRequest<RequestConSesion>();
    const [esquema, token] = (req.headers.authorization ?? '').split(' ');
    if (esquema?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Falta el token de acceso');
    }
    let sesion: SesionUsuario;
    try {
      sesion = sesionDesdeToken(await this.verificador.verificar(token));
    } catch {
      // No filtramos la causa (firma, expiración, audiencia) al cliente.
      throw new UnauthorizedException('Token no válido o expirado');
    }
    if (rolPrincipal(sesion.roles) === null) {
      throw new ForbiddenException('El usuario no tiene un rol asignado en el sistema');
    }
    // Un usuario desactivado pierde acceso en segundos, aunque su token siga vigente.
    if (!(await this.activos.estaActivo(sesion.id))) {
      throw new ForbiddenException('Tu usuario está desactivado');
    }
    req.sesion = sesion;
    return true;
  }
}
