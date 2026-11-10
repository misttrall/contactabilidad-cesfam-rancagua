import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { filtrosDashboardSchema, filtrosReporteSchema, type SesionUsuario } from '@bh/shared';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { centroIdOpcional } from '../auth/centro';
import { RequiereModulo, Sesion, type RequestConSesion } from '../auth/decoradores';
import type { Reloj } from '../mensajeria/procesador.service';
import { PrismaService } from '../prisma/prisma.service';
import { RELOJ } from '../tokens';
import { construirLibroReporte } from './excel';
import { ReportesService } from './reportes.service';

function parsear<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, valor: unknown): T {
  const r = schema.safeParse(valor);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}

@Controller('api')
export class ReportesController {
  constructor(
    @Inject(ReportesService) private readonly reportes: ReportesService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  /** La funcionaria ve su centro; el encargado y el administrador, todos o el que elijan. */
  @Get('dashboard')
  @RequiereModulo('dashboard')
  async dashboard(@Query() query: unknown, @Sesion() sesion: SesionUsuario) {
    const { centro, fecha } = parsear(filtrosDashboardSchema, query);
    return this.reportes.dashboard(await centroIdOpcional(this.prisma, sesion, centro), fecha);
  }

  @Get('reportes/resumen')
  @RequiereModulo('reportes')
  async resumen(@Query() query: unknown, @Sesion() sesion: SesionUsuario) {
    const f = parsear(filtrosReporteSchema, query);
    return this.reportes.resumen(await centroIdOpcional(this.prisma, sesion, f.centro), f);
  }

  /** Excel con cifras agregadas (sin datos personales). Cada descarga queda auditada. */
  @Get('reportes/exportar')
  @RequiereModulo('reportes')
  async exportar(
    @Query() query: unknown,
    @Sesion() sesion: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const f = parsear(filtrosReporteSchema, query);
    const centroId = await centroIdOpcional(this.prisma, sesion, f.centro);
    const [resumen, centro] = await Promise.all([
      this.reportes.resumen(centroId, f),
      centroId ? this.prisma.centro.findUnique({ where: { id: centroId } }) : null,
    ]);
    const libro = construirLibroReporte(
      resumen,
      centro?.nombre ?? 'Todos los centros',
      this.reloj.ahora().toISOString(),
    );
    await this.auditoria.registrar({
      usuarioId: sesion.id,
      accion: 'reporte.exportar',
      recurso: 'reporte',
      ...(centroId ? { centroId } : {}),
      ...(req.ip ? { ip: req.ip } : {}),
      detalle: { desde: f.desde, hasta: f.hasta, centro: centro?.codigo ?? null },
    });
    return new StreamableFile(libro, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="reporte-contactabilidad_${f.desde}_${f.hasta}.xlsx"`,
    });
  }
}
