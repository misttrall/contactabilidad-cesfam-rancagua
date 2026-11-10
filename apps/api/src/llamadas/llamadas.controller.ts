import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  filtrosHistorialSchema,
  normalizarRut,
  registroEntranteSchema,
  resultadoSalienteSchema,
  type SesionUsuario,
} from '@bh/shared';
import { z } from 'zod';
import { centroDelUsuario, centroIdOpcional } from '../auth/centro';
import { RequiereModulo, Sesion, type RequestConSesion } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';
import { LlamadasEntrantesService } from './llamadas-entrantes.service';
import { PendientesService } from './pendientes.service';

const ID = z.string().uuid();
const revelarSchema = z.object({ campo: z.enum(['telefono', 'rut']) }).strict();
const centroQuery = z.object({ centro: z.string().trim().min(1).optional() });

function parsear<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, valor: unknown): T {
  const r = schema.safeParse(valor);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}
const idOr404 = (id: string, que: string) => {
  if (!ID.safeParse(id).success) throw new NotFoundException(`${que} no encontrado`);
  return id;
};

// ---------------------------------------------------------------------------- pendientes

@Controller('api/pendientes')
@RequiereModulo('pendientes')
export class PendientesController {
  constructor(
    @Inject(PendientesService) private readonly pendientes: PendientesService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get()
  async listar(@Sesion() sesion: SesionUsuario, @Query() query: unknown) {
    const { centro } = parsear(centroQuery, query);
    const c = await centroDelUsuario(this.prisma, sesion, centro);
    return { filas: await this.pendientes.listar(c.id) };
  }

  @Get(':citaId/contactos')
  async contactos(@Param('citaId') citaId: string, @Sesion() sesion: SesionUsuario) {
    return this.pendientes.contactos(
      idOr404(citaId, 'Cita'),
      await centroIdOpcional(this.prisma, sesion),
    );
  }

  @Post(':citaId/resultado')
  async resultado(
    @Param('citaId') citaId: string,
    @Body() body: unknown,
    @Sesion() sesion: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const dto = parsear(resultadoSalienteSchema, body);
    return this.pendientes.registrarResultado(
      sesion.id,
      idOr404(citaId, 'Cita'),
      await centroIdOpcional(this.prisma, sesion),
      dto,
      req.ip,
    );
  }
}

// ---------------------------------------------------------------------------- pacientes

@Controller('api/pacientes')
export class PacientesController {
  constructor(
    @Inject(PendientesService) private readonly pendientes: PendientesService,
    @Inject(LlamadasEntrantesService) private readonly entrantes: LlamadasEntrantesService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /** Búsqueda por RUT para la llamada entrante: solo pacientes con citas en el centro. */
  @Get('buscar')
  @RequiereModulo('llamada_entrante')
  async buscar(
    @Sesion() sesion: SesionUsuario,
    @Req() req: RequestConSesion,
    @Query('rut') rut?: string,
    @Query('centro') centro?: string,
  ) {
    const normalizado = rut ? normalizarRut(rut) : null;
    if (!normalizado) throw new BadRequestException('RUT no válido: revisa el dígito verificador');
    const c = await centroDelUsuario(this.prisma, sesion, centro);
    return this.entrantes.buscar(sesion.id, c.id, normalizado, req.ip);
  }

  /** Muestra el teléfono o el RUT completo. Cada revelación queda auditada. */
  @Post(':id/revelar')
  @RequiereModulo('pendientes')
  async revelar(
    @Param('id') id: string,
    @Body() body: unknown,
    @Sesion() sesion: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const { campo } = parsear(revelarSchema, body);
    return this.pendientes.revelar(
      sesion.id,
      idOr404(id, 'Paciente'),
      campo,
      await centroIdOpcional(this.prisma, sesion),
      req.ip,
    );
  }
}

// ----------------------------------------------------------------- llamadas entrantes

@Controller('api/llamadas-entrantes')
export class LlamadasEntrantesController {
  constructor(
    @Inject(LlamadasEntrantesService) private readonly entrantes: LlamadasEntrantesService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Post()
  @RequiereModulo('llamada_entrante')
  async registrar(
    @Body() body: unknown,
    @Sesion() sesion: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const dto = parsear(registroEntranteSchema, body);
    const centro = await centroDelUsuario(this.prisma, sesion, dto.centro);
    return this.entrantes.registrar(sesion.id, centro.id, dto, req.ip);
  }

  /** Historial paginado. La funcionaria ve su centro; encargado y administrador, todos o uno. */
  @Get()
  @RequiereModulo('historial')
  async historial(@Query() query: unknown, @Sesion() sesion: SesionUsuario) {
    const filtros = parsear(filtrosHistorialSchema, query);
    const centroId = await centroIdOpcional(this.prisma, sesion, filtros.centro);
    return this.entrantes.historial(centroId, filtros);
  }
}
