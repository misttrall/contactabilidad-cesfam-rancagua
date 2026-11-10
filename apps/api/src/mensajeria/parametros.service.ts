import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CLAVES_PARAMETRO,
  PARAMETROS,
  esClaveParametro,
  validarParametro,
  type ClaveParametro,
} from '@bh/shared';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PrismaService } from '../prisma/prisma.service';

type Valor<K extends ClaveParametro> = (typeof PARAMETROS)[K]['porDefecto'];

/** Parámetros de operación editables por el administrador, con valor por defecto y validación. */
@Injectable()
export class ParametrosService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /** Si falta o está dañado en la BD, vale el valor por defecto (la operación no se cae por eso). */
  async leer<K extends ClaveParametro>(clave: K): Promise<Valor<K>> {
    const p = await this.prisma.parametro.findUnique({ where: { clave } });
    if (!p) return PARAMETROS[clave].porDefecto;
    const r = PARAMETROS[clave].schema.safeParse(p.valor);
    return (r.success ? r.data : PARAMETROS[clave].porDefecto) as Valor<K>;
  }

  async listar() {
    const filas = await Promise.all(
      CLAVES_PARAMETRO.map(async (clave) => ({
        clave,
        descripcion: PARAMETROS[clave].descripcion,
        valor: await this.leer(clave),
        porDefecto: PARAMETROS[clave].porDefecto,
      })),
    );
    return filas;
  }

  async actualizar(clave: string, valor: unknown, usuarioId: string, ip?: string) {
    if (!esClaveParametro(clave)) throw new BadRequestException(`Parámetro desconocido: ${clave}`);
    const v = validarParametro(clave, valor);
    if (!v.ok) throw new BadRequestException(v.error);

    const anterior = await this.leer(clave);
    await this.prisma.parametro.upsert({
      where: { clave },
      update: { valor: v.valor as Prisma.InputJsonValue, actualizadoPor: usuarioId },
      create: { clave, valor: v.valor as Prisma.InputJsonValue, actualizadoPor: usuarioId },
    });
    await this.auditoria.registrar({
      usuarioId,
      accion: 'parametro.actualizar',
      recurso: 'parametro',
      recursoId: clave,
      ...(ip ? { ip } : {}),
      detalle: {
        anterior: anterior as Prisma.InputJsonValue,
        nuevo: v.valor as Prisma.InputJsonValue,
      },
    });
    return { clave, valor: v.valor };
  }
}
