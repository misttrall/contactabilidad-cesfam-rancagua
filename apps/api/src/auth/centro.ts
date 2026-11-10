import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { resolverAlcance, type SesionUsuario } from '@bh/shared';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Centro sobre el que opera el usuario. La funcionaria solo puede el suyo (pedir otro es 403);
 * encargado y administrador deben indicarlo.
 */
export async function centroDelUsuario(
  prisma: PrismaService,
  sesion: SesionUsuario,
  codigo?: string,
) {
  const alcance = resolverAlcance(sesion, codigo);
  if (alcance.tipo === 'prohibido') throw new ForbiddenException(alcance.motivo);
  if (alcance.tipo === 'todos') throw new BadRequestException('Indica el centro');
  const centro = await prisma.centro.findUnique({ where: { codigo: alcance.centroId } });
  if (!centro || !centro.activo) throw new NotFoundException('Centro no encontrado');
  return centro;
}

/** Id del centro al que se limita una consulta (null = sin límite: encargado/administrador). */
export async function centroIdDeAlcance(
  prisma: PrismaService,
  sesion: SesionUsuario,
): Promise<string | null> {
  const alcance = resolverAlcance(sesion);
  if (alcance.tipo === 'prohibido') throw new ForbiddenException(alcance.motivo);
  if (alcance.tipo === 'todos') return null;
  const c = await prisma.centro.findUnique({ where: { codigo: alcance.centroId } });
  if (!c) throw new NotFoundException('Centro no encontrado');
  return c.id;
}
