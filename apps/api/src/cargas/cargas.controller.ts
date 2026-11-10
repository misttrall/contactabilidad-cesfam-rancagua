import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { resolverAlcance, type SesionUsuario } from '@bh/shared';
import { z } from 'zod';
import { RequiereModulo, Sesion, type RequestConSesion } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_BYTES, generarPlantilla } from './excel';
import { CargasService } from './cargas.service';

const cuerpoSchema = z.object({
  centro: z.string().trim().min(1).optional(),
  excluirMorbilidad: z.enum(['true', 'false']).optional(),
});

/** Multer en memoria: el archivo nunca toca el disco. */
const subida = FileInterceptor('archivo', {
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, archivo, cb) => {
    const ok = /\.(xlsx|xls)$/i.test(archivo.originalname);
    cb(ok ? null : new BadRequestException('Solo se aceptan planillas .xlsx o .xls'), ok);
  },
});

/** Fecha de ejemplo de la plantilla: dos días después de hoy, en hora de Chile. */
function fechaEjemplo(): string {
  const en2dias = new Date(Date.now() + 2 * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(en2dias);
}

@Controller('api/cargas')
@RequiereModulo('cargar_citas')
export class CargasController {
  constructor(
    @Inject(CargasService) private readonly cargas: CargasService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /** Opciones de la pantalla y últimas cargas visibles para el usuario. */
  @Get()
  async resumen(@Sesion() sesion: SesionUsuario, @Query('centro') centro?: string) {
    const alcance = resolverAlcance(sesion, centro);
    if (alcance.tipo === 'prohibido') throw new ForbiddenException(alcance.motivo);
    const centroDb =
      alcance.tipo === 'centro'
        ? await this.prisma.centro.findUnique({ where: { codigo: alcance.centroId } })
        : null;
    return {
      opciones: await this.cargas.opciones(),
      historial: await this.cargas.historial(centroDb?.id ?? null),
    };
  }

  @Get('plantilla')
  plantilla() {
    return new StreamableFile(generarPlantilla(fechaEjemplo()), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="plantilla-citas.xlsx"',
    });
  }

  @Post('validar')
  @UseInterceptors(subida)
  async validar(
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body() body: unknown,
    @Sesion() sesion: SesionUsuario,
  ) {
    const { centro, excluir } = await this.preparar(archivo, body, sesion);
    return this.cargas.validar(centro.id, archivo!.buffer, excluir);
  }

  @Post()
  @UseInterceptors(subida)
  async importar(
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body() body: unknown,
    @Sesion() sesion: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const { centro, excluir } = await this.preparar(archivo, body, sesion);
    return this.cargas.importar(sesion.id, centro.id, archivo!.buffer, excluir, req.ip);
  }

  private async preparar(
    archivo: Express.Multer.File | undefined,
    body: unknown,
    sesion: SesionUsuario,
  ) {
    if (!archivo) throw new BadRequestException('Adjunta la planilla en el campo "archivo"');
    const parsed = cuerpoSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Datos del formulario no válidos');

    const alcance = resolverAlcance(sesion, parsed.data.centro);
    if (alcance.tipo === 'prohibido') throw new ForbiddenException(alcance.motivo);
    if (alcance.tipo === 'todos')
      throw new BadRequestException('Indica el centro al que corresponde la planilla');

    const centro = await this.prisma.centro.findUnique({ where: { codigo: alcance.centroId } });
    if (!centro || !centro.activo) throw new NotFoundException('Centro no encontrado');

    const excluir =
      parsed.data.excluirMorbilidad !== undefined
        ? parsed.data.excluirMorbilidad === 'true'
        : (await this.cargas.opciones()).excluirMorbilidadPorDefecto;
    return { centro, excluir };
  }
}
