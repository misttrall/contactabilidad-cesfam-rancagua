import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  edadCumplida,
  enmascararRut,
  enmascararTelefono,
  esAdultoMayor,
  partesSantiago,
  type SesionUsuario,
} from '@bh/shared';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { centroDelUsuario, centroIdDeAlcance } from '../auth/centro';
import { RequiereModulo, Sesion, type RequestConSesion } from '../auth/decoradores';
import { CifradoService } from '../cifrado/cifrado.service';
import type { Config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { CONFIG, RELOJ } from '../tokens';
import { EnvioService } from './envio.service';
import { ParametrosService } from './parametros.service';
import type { Reloj } from './procesador.service';
import { SimulacionService } from './simulacion.service';

const consultaSchema = z.object({
  centro: z.string().trim().min(1).optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha con formato AAAA-MM-DD'),
  tipo: z.enum(['cronico', 'morbilidad', 'todos']).default('cronico'),
});

const envioSchema = z.object({
  centro: z.string().trim().min(1).optional(),
  citaIds: z.array(z.string().uuid()).min(1, 'Selecciona al menos una cita').max(1000),
});
const simularSchema = z.object({ centro: z.string().trim().min(1).optional() });
const ID = z.string().uuid();

const ESTADOS = ['sin_enviar', 'enviado', 'confirmado', 'sin_respuesta', 'cancelado'] as const;

@Controller('api')
@RequiereModulo('confirmacion_masiva')
export class ConfirmacionesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(EnvioService) private readonly envios: EnvioService,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(SimulacionService) private readonly simulacion: SimulacionService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  /** Citas de un día con su estado de contacto, y el resumen por estado. */
  @Get('confirmaciones')
  async listar(@Sesion() sesion: SesionUsuario, @Query() query: unknown) {
    const q = consultaSchema.safeParse(query);
    if (!q.success) throw new BadRequestException(q.error.issues.map((i) => i.message).join('; '));
    const centro = await centroDelUsuario(this.prisma, sesion, q.data.centro);

    const citas = await this.prisma.cita.findMany({
      where: {
        centroId: centro.id,
        fecha: new Date(`${q.data.fecha}T00:00:00.000Z`),
        ...(q.data.tipo !== 'todos' ? { tipo: q.data.tipo } : {}),
      },
      include: {
        tarea: true,
        paciente: {
          select: {
            nombre: true,
            rut: true,
            telefonoCifrado: true,
            whatsappBaja: true,
            fechaNacimiento: true,
          },
        },
        mensajes: { where: { tipo: 'confirmacion' }, select: { id: true } },
      },
      orderBy: [{ hora: 'asc' }, { id: 'asc' }],
      take: 1000,
    });

    const resumen = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<
      (typeof ESTADOS)[number],
      number
    >;
    const filas = citas.map((c) => {
      const estado = c.tarea?.estado ?? 'sin_enviar';
      resumen[estado]++;
      const nac = c.paciente.fechaNacimiento?.toISOString().slice(0, 10);
      const edad = nac ? edadCumplida(nac, c.fecha.toISOString().slice(0, 10)) : null;
      const motivoNoSeleccionable =
        estado !== 'sin_enviar' || c.mensajes.length > 0
          ? 'ya_enviada'
          : c.paciente.whatsappBaja
            ? 'baja'
            : !c.paciente.telefonoCifrado
              ? 'sin_telefono'
              : null;
      return {
        id: c.id,
        hora: c.hora,
        paciente: c.paciente.nombre,
        rut: enmascararRut(c.paciente.rut),
        telefono: c.paciente.telefonoCifrado
          ? enmascararTelefono(this.cifrado.descifrar(c.paciente.telefonoCifrado))
          : null,
        profesional: c.profesionalNombre,
        prestacion: c.prestacion,
        tipo: c.tipo,
        estado,
        subestado: c.tarea?.subestado ?? null,
        adultoMayor: edad !== null && esAdultoMayor(edad),
        seleccionable: motivoNoSeleccionable === null,
        motivoNoSeleccionable,
      };
    });

    const anticipacion = await this.parametros.leer('envio.anticipacion_horas');
    return {
      opciones: {
        modo: this.config.whatsapp.modo,
        puedeSimular: this.puedeSimular(),
        anticipacionHoras: anticipacion,
        ventana: await this.parametros.leer('envio.ventana_horaria'),
        horasEspera: await this.parametros.leer('envio.horas_espera_respuesta'),
        fechaSugerida: partesSantiago(
          new Date(this.reloj.ahora().getTime() + anticipacion * 3_600_000),
        ).fecha,
      },
      resumen,
      filas,
      truncado: citas.length === 1000,
    };
  }

  /** Para el diálogo de confirmación. No escribe nada. */
  @Post('envios/previsualizar')
  async previsualizar(@Sesion() sesion: SesionUsuario, @Body() body: unknown) {
    const { centro, citaIds } = await this.parsear(sesion, body);
    return this.envios.previsualizar(centro, citaIds);
  }

  @Post('envios')
  async crear(
    @Sesion() sesion: SesionUsuario,
    @Body() body: unknown,
    @Req() req: RequestConSesion,
  ) {
    const { centro, citaIds } = await this.parsear(sesion, body);
    return this.envios.crear(sesion.id, centro, citaIds, req.ip);
  }

  @Get('envios/:id')
  async progreso(@Param('id') id: string, @Sesion() sesion: SesionUsuario) {
    if (!ID.safeParse(id).success) throw new NotFoundException('Envío no encontrado');
    return this.envios.progreso(id, await centroIdDeAlcance(this.prisma, sesion));
  }

  /** SOLO DEMO: contesta como si fueran los pacientes (por el mismo camino que el webhook real). */
  @Post('envios/simular-respuestas')
  async simular(@Sesion() sesion: SesionUsuario, @Body() body: unknown) {
    if (!this.puedeSimular()) {
      throw new ForbiddenException(
        'La simulación solo existe con WHATSAPP_MODO=simulador fuera de producción',
      );
    }
    const p = simularSchema.safeParse(body ?? {});
    if (!p.success) throw new BadRequestException('Datos no válidos');
    const centro = await centroDelUsuario(this.prisma, sesion, p.data.centro);
    return this.simulacion.simular(centro.id);
  }

  // ------------------------------------------------------------------- horas por liberar en AVIS

  /** Pacientes que respondieron «No»: su hora debe liberarse en AVIS. */
  @Get('liberaciones')
  async liberaciones(@Sesion() sesion: SesionUsuario) {
    const centroId = await centroIdDeAlcance(this.prisma, sesion);
    const filas = await this.prisma.liberacion.findMany({
      where: { resueltaEn: null, ...(centroId ? { cita: { centroId } } : {}) },
      include: {
        cita: {
          include: {
            paciente: { select: { nombre: true, rut: true } },
            centro: { select: { codigo: true } },
          },
        },
      },
      orderBy: { creadaEn: 'asc' },
      take: 500,
    });
    return filas.map((l) => ({
      id: l.id,
      creadaEn: l.creadaEn,
      fecha: l.cita.fecha.toISOString().slice(0, 10),
      hora: l.cita.hora,
      paciente: l.cita.paciente.nombre,
      rut: enmascararRut(l.cita.paciente.rut),
      profesional: l.cita.profesionalNombre,
      centro: l.cita.centro.codigo,
    }));
  }

  @Post('liberaciones/:id/resolver')
  async resolverLiberacion(
    @Param('id') id: string,
    @Sesion() sesion: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    if (!ID.safeParse(id).success) throw new NotFoundException('Liberación no encontrada');
    const centroId = await centroIdDeAlcance(this.prisma, sesion);
    const r = await this.prisma.liberacion.updateMany({
      where: { id, resueltaEn: null, ...(centroId ? { cita: { centroId } } : {}) },
      data: { resueltaEn: this.reloj.ahora(), resueltaPor: sesion.id },
    });
    if (r.count === 0) throw new NotFoundException('Liberación no encontrada o ya resuelta');
    await this.auditoria.registrar({
      usuarioId: sesion.id,
      accion: 'liberacion.resolver',
      recurso: 'liberacion',
      recursoId: id,
      ...(req.ip ? { ip: req.ip } : {}),
    });
    return { id, resuelta: true };
  }

  private puedeSimular() {
    return this.config.whatsapp.modo === 'simulador' && this.config.ambiente !== 'PRODUCCION';
  }

  private async parsear(sesion: SesionUsuario, body: unknown) {
    const p = envioSchema.safeParse(body);
    if (!p.success) throw new BadRequestException(p.error.issues.map((i) => i.message).join('; '));
    const centro = await centroDelUsuario(this.prisma, sesion, p.data.centro);
    return { centro, citaIds: p.data.citaIds };
  }
}
