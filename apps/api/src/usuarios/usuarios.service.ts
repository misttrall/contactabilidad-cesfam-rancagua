import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { resolverAlcance, rolPrincipal, type SesionUsuario } from '@bh/shared';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsuariosService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Alta/actualización automática del usuario a partir del token (la identidad vive en Keycloak)
   * y registro del ingreso en la bitácora.
   */
  async registrarIngreso(s: SesionUsuario, ip?: string) {
    const rol = rolPrincipal(s.roles);
    const alcance = resolverAlcance(s);
    if (rol === null || alcance.tipo === 'prohibido') {
      throw new ForbiddenException(alcance.tipo === 'prohibido' ? alcance.motivo : 'Sin rol');
    }

    const centro = s.centroId
      ? await this.prisma.centro.findUnique({ where: { codigo: s.centroId } })
      : null;
    if (rol === 'funcionaria' && !centro) {
      throw new ForbiddenException('Tu centro no existe en el sistema: contacta al administrador');
    }

    const usuario = await this.prisma.usuario.upsert({
      where: { keycloakId: s.id },
      update: { nombre: s.nombre, rol, centroId: centro?.id ?? null, ultimoIngreso: new Date() },
      create: {
        keycloakId: s.id,
        nombre: s.nombre,
        rol,
        centroId: centro?.id ?? null,
        ultimoIngreso: new Date(),
      },
    });
    if (!usuario.activo) throw new ForbiddenException('Tu usuario está desactivado');

    await this.auditoria.registrar({
      usuarioId: s.id,
      accion: 'sesion.ingreso',
      recurso: 'usuario',
      recursoId: usuario.id,
      ...(centro ? { centroId: centro.id } : {}),
      ...(ip ? { ip } : {}),
    });
    return { usuario, centro, rol };
  }
}
