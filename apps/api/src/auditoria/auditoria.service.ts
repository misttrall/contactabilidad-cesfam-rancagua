import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface EventoAuditoria {
  usuarioId?: string | undefined;
  accion: string;
  recurso: string;
  recursoId?: string | undefined;
  centroId?: string | undefined;
  ip?: string | undefined;
  /** NUNCA incluir RUT completo, teléfono ni datos clínicos. */
  detalle?: Prisma.InputJsonValue | undefined;
}

@Injectable()
export class AuditoriaService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async registrar(e: EventoAuditoria): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        accion: e.accion,
        recurso: e.recurso,
        usuarioId: e.usuarioId ?? null,
        recursoId: e.recursoId ?? null,
        centroId: e.centroId ?? null,
        ip: e.ip ?? null,
        ...(e.detalle !== undefined ? { detalle: e.detalle } : {}),
      },
    });
  }
}
