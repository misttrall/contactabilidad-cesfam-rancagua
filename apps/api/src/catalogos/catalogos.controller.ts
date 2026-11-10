import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { resolverAlcance, type SesionUsuario } from '@bh/shared';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RequiereModulo, Sesion, type RequestConSesion } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';

const patchMotivoSchema = z
  .object({
    activo: z.boolean().optional(),
    descripcion: z.string().trim().min(3).max(120).optional(),
  })
  .strict()
  .refine((d) => d.activo !== undefined || d.descripcion !== undefined, {
    message: 'Indica al menos un campo a modificar',
  });
const idSchema = z.string().uuid();

@Controller('api')
export class CatalogosController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /** Centro(s) visibles: la funcionaria solo ve el suyo; encargado y administrador ven todos. */
  @Get('centros')
  async centros(@Sesion() sesion: SesionUsuario) {
    const alcance = this.alcanceODenegar(sesion);
    return this.prisma.centro.findMany({
      where: { activo: true, ...(alcance.tipo === 'centro' ? { codigo: alcance.centroId } : {}) },
      orderBy: { nombre: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    });
  }

  /** Motivos de llamada vigentes, para el formulario de llamada entrante. */
  @Get('motivos')
  motivos() {
    return this.prisma.motivoLlamada.findMany({
      where: { activo: true },
      orderBy: { orden: 'asc' },
      select: { id: true, codigo: true, descripcion: true },
    });
  }

  @Get('profesionales')
  async profesionales(@Sesion() sesion: SesionUsuario, @Query('centro') centro?: string) {
    const alcance = this.alcanceODenegar(sesion, centro);
    return this.prisma.profesional.findMany({
      where: {
        activo: true,
        ...(alcance.tipo === 'centro' ? { centro: { codigo: alcance.centroId } } : {}),
      },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, especialidad: true, centro: { select: { codigo: true } } },
    });
  }

  // ---- Administración (solo rol con acceso al módulo "configuracion") ----

  @Get('config/motivos')
  @RequiereModulo('configuracion')
  motivosAdmin() {
    return this.prisma.motivoLlamada.findMany({ orderBy: { orden: 'asc' } });
  }

  @Patch('config/motivos/:id')
  @RequiereModulo('configuracion')
  async actualizarMotivo(
    @Param('id') id: string,
    @Body() body: unknown,
    @Sesion() sesion: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    if (!idSchema.safeParse(id).success) throw new BadRequestException('Identificador no válido');
    const parsed = patchMotivoSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const actual = await this.prisma.motivoLlamada.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Motivo no encontrado');

    const cambios = parsed.data;
    const actualizado = await this.prisma.motivoLlamada.update({
      where: { id },
      data: {
        ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
        ...(cambios.descripcion !== undefined ? { descripcion: cambios.descripcion } : {}),
      },
    });
    await this.auditoria.registrar({
      usuarioId: sesion.id,
      accion: 'motivo.actualizar',
      recurso: 'motivo_llamada',
      recursoId: id,
      ...(req.ip ? { ip: req.ip } : {}),
      detalle: { codigo: actual.codigo, cambios },
    });
    return actualizado;
  }

  private alcanceODenegar(sesion: SesionUsuario, centroSolicitado?: string) {
    const alcance = resolverAlcance(sesion, centroSolicitado);
    if (alcance.tipo === 'prohibido') throw new ForbiddenException(alcance.motivo);
    return alcance;
  }
}
