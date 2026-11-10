import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TTL_MS = 30_000;

/**
 * ¿El usuario está activo en el sistema? Un token firmado sigue siendo válido hasta que vence (5 min);
 * esto permite que una desactivación surta efecto en segundos y no al expirar el token. Se consulta
 * con una caché corta para no tocar la base en cada petición. Quien aún no tiene fila (primer
 * ingreso) se considera activo.
 */
@Injectable()
export class UsuarioActivoService {
  private readonly cache = new Map<string, { activo: boolean; hasta: number }>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async estaActivo(keycloakId: string): Promise<boolean> {
    const c = this.cache.get(keycloakId);
    if (c && c.hasta > Date.now()) return c.activo;
    const u = await this.prisma.usuario.findUnique({
      where: { keycloakId },
      select: { activo: true },
    });
    const activo = u?.activo ?? true;
    this.cache.set(keycloakId, { activo, hasta: Date.now() + TTL_MS });
    return activo;
  }

  /** Tras desactivar o reactivar, el cambio se aplica de inmediato en esta instancia. */
  invalidar(keycloakId: string): void {
    this.cache.delete(keycloakId);
  }
}
