import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PLANTILLAS,
  ROLES,
  textoConfirmacion,
  textoRecordatorio,
  BOTON_NO,
  BOTON_SI,
  type SesionUsuario,
} from '@bh/shared';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { RequiereModulo, Sesion, type RequestConSesion } from '../auth/decoradores';
import type { Config } from '../config';
import { ParametrosService } from '../mensajeria/parametros.service';
import { PrismaService } from '../prisma/prisma.service';
import { CONFIG } from '../tokens';
import { KeycloakAdminService } from '../usuarios/keycloak-admin.service';
import { UsuarioActivoService } from '../usuarios/usuario-activo.service';
import { DemoService } from './demo.service';

function parsear<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, valor: unknown): T {
  const r = schema.safeParse(valor);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}
const idOr404 = (id: string, que: string) => {
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundException(`${que} no encontrado`);
  return id;
};
const esUnicidad = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const centroNuevoSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,12}$/, 'Código de 2 a 12 letras o números'),
    nombre: z.string().trim().min(3, 'El nombre es muy corto').max(80),
  })
  .strict();
const centroEdicionSchema = z
  .object({ nombre: z.string().trim().min(3).max(80).optional(), activo: z.boolean().optional() })
  .strict()
  .refine((d) => d.nombre !== undefined || d.activo !== undefined, {
    message: 'Indica qué cambiar',
  });
const motivoNuevoSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_]{2,30}$/, 'Código de 2 a 30 caracteres (letras, números o _)'),
    descripcion: z.string().trim().min(3).max(120),
  })
  .strict();
const moverSchema = z.object({ direccion: z.enum(['arriba', 'abajo']) }).strict();
const usuarioEdicionSchema = z
  .object({
    rol: z.enum(ROLES).optional(),
    centro: z.string().trim().min(1).nullable().optional(),
    activo: z.boolean().optional(),
  })
  .strict()
  .refine((d) => d.rol !== undefined || d.centro !== undefined || d.activo !== undefined, {
    message: 'Indica qué cambiar',
  });
const demoSchema = z
  .object({
    sembrar: z.boolean().default(true),
    confirmacion: z.literal('RESTABLECER', {
      errorMap: () => ({ message: 'Escribe RESTABLECER para confirmar' }),
    }),
  })
  .strict();

/** Administración del sistema: solo el rol con acceso al módulo «configuración». */
@Controller('api/config')
@RequiereModulo('configuracion')
export class AdministracionController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(KeycloakAdminService) private readonly keycloak: KeycloakAdminService,
    @Inject(UsuarioActivoService) private readonly activos: UsuarioActivoService,
    @Inject(DemoService) private readonly demo: DemoService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  private auditar(
    s: SesionUsuario,
    req: RequestConSesion,
    accion: string,
    recurso: string,
    recursoId: string,
    detalle: Prisma.InputJsonValue,
  ) {
    return this.auditoria.registrar({
      usuarioId: s.id,
      accion,
      recurso,
      recursoId,
      ...(req.ip ? { ip: req.ip } : {}),
      detalle,
    });
  }

  // ------------------------------------------------------------------------------- centros

  @Get('centros')
  centros() {
    return this.prisma.centro.findMany({
      orderBy: { nombre: 'asc' },
      select: { id: true, codigo: true, nombre: true, activo: true },
    });
  }

  @Post('centros')
  async crearCentro(
    @Body() body: unknown,
    @Sesion() s: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const d = parsear(centroNuevoSchema, body);
    try {
      const c = await this.prisma.centro.create({
        data: d,
        select: { id: true, codigo: true, nombre: true, activo: true },
      });
      await this.auditar(s, req, 'centro.crear', 'centro', c.id, { codigo: c.codigo });
      return c;
    } catch (e) {
      if (esUnicidad(e))
        throw new ConflictException(`Ya existe un centro con el código ${d.codigo}`);
      throw e;
    }
  }

  @Patch('centros/:id')
  async editarCentro(
    @Param('id') id: string,
    @Body() body: unknown,
    @Sesion() s: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const d = parsear(centroEdicionSchema, body);
    const actual = await this.prisma.centro.findUnique({ where: { id: idOr404(id, 'Centro') } });
    if (!actual) throw new NotFoundException('Centro no encontrado');
    const c = await this.prisma.centro.update({
      where: { id },
      data: {
        ...(d.nombre !== undefined ? { nombre: d.nombre } : {}),
        ...(d.activo !== undefined ? { activo: d.activo } : {}),
      },
      select: { id: true, codigo: true, nombre: true, activo: true },
    });
    await this.auditar(s, req, 'centro.actualizar', 'centro', id, {
      codigo: actual.codigo,
      cambios: d,
    });
    return c;
  }

  // ------------------------------------------------------------------------------- motivos

  @Post('motivos')
  async crearMotivo(
    @Body() body: unknown,
    @Sesion() s: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const d = parsear(motivoNuevoSchema, body);
    const max = await this.prisma.motivoLlamada.aggregate({ _max: { orden: true } });
    try {
      const m = await this.prisma.motivoLlamada.create({
        data: { ...d, orden: (max._max.orden ?? -1) + 1 },
      });
      await this.auditar(s, req, 'motivo.crear', 'motivo_llamada', m.id, { codigo: m.codigo });
      return m;
    } catch (e) {
      if (esUnicidad(e))
        throw new ConflictException(`Ya existe un motivo con el código ${d.codigo}`);
      throw e;
    }
  }

  /** Intercambia el orden con el vecino (el orden es el de la lista al registrar una llamada). */
  @Post('motivos/:id/mover')
  async moverMotivo(
    @Param('id') id: string,
    @Body() body: unknown,
    @Sesion() s: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const { direccion } = parsear(moverSchema, body);
    idOr404(id, 'Motivo');
    const lista = await this.prisma.motivoLlamada.findMany({
      orderBy: [{ orden: 'asc' }, { codigo: 'asc' }],
    });
    const i = lista.findIndex((m) => m.id === id);
    if (i < 0) throw new NotFoundException('Motivo no encontrado');
    const j = direccion === 'arriba' ? i - 1 : i + 1;
    if (j >= 0 && j < lista.length) {
      // Se renumera todo el catálogo: evita órdenes repetidos y deja posiciones consecutivas.
      const nuevo = [...lista];
      [nuevo[i], nuevo[j]] = [nuevo[j]!, nuevo[i]!];
      await this.prisma.$transaction(
        nuevo.map((m, k) =>
          this.prisma.motivoLlamada.update({ where: { id: m.id }, data: { orden: k } }),
        ),
      );
      await this.auditar(s, req, 'motivo.reordenar', 'motivo_llamada', id, { direccion });
    }
    return this.prisma.motivoLlamada.findMany({ orderBy: { orden: 'asc' } });
  }

  // ----------------------------------------------------------------------------- plantillas

  /**
   * Plantillas de WhatsApp vigentes. El texto que ve el paciente lo fija la plantilla APROBADA en Meta:
   * cambiarlo exige una plantilla nueva (y su aprobación), por eso aquí es de solo lectura. El texto de
   * reagendamiento sí es editable (Parámetros).
   */
  @Get('plantillas')
  async plantillas() {
    const ejemplo = { centro: 'CESFAM Centro', fecha: '2026-11-25', hora: '09:30' };
    return {
      modo: this.config.whatsapp.modo,
      plantillas: [
        {
          clave: 'confirmacion',
          nombre: this.config.whatsapp.plantillaConfirmacion,
          idioma: PLANTILLAS.confirmacion.idioma,
          texto: textoConfirmacion(ejemplo),
          botones: [BOTON_SI, BOTON_NO],
        },
        {
          clave: 'recordatorio',
          nombre: this.config.whatsapp.plantillaRecordatorio,
          idioma: PLANTILLAS.recordatorio.idioma,
          texto: textoRecordatorio(ejemplo),
          botones: [BOTON_SI, BOTON_NO],
        },
      ],
      parametros: ['Nombre del centro', 'Fecha de la cita', 'Hora de la cita'],
      reagendamiento: await this.parametros.leer('mensajes.reagendamiento_info'),
      nota: 'El texto lo fija la plantilla aprobada en Meta. Para cambiarlo hay que crear una plantilla nueva y esperar su aprobación.',
    };
  }

  // ------------------------------------------------------------------------------- usuarios

  @Get('usuarios')
  async usuarios(@Sesion() s: SesionUsuario) {
    if (!this.keycloak.habilitado) return { habilitado: false as const, usuarios: [] };
    const [kc, locales] = await Promise.all([
      this.keycloak.listar(),
      this.prisma.usuario.findMany({ select: { keycloakId: true, ultimoIngreso: true } }),
    ]);
    const ingreso = new Map(locales.map((l) => [l.keycloakId, l.ultimoIngreso]));
    return {
      habilitado: true as const,
      usuarios: kc.map((u) => ({
        ...u,
        ultimoIngreso: ingreso.get(u.id) ?? null,
        esYo: u.id === s.id,
      })),
    };
  }

  /**
   * Cambia el rol, el centro o la activación de un usuario. Reglas: una funcionaria siempre necesita
   * un centro activo; encargado y administrador no llevan centro; nadie puede quitarse a sí mismo el rol
   * de administrador ni desactivarse (quedaría sin acceso).
   */
  @Patch('usuarios/:id')
  async editarUsuario(
    @Param('id') id: string,
    @Body() body: unknown,
    @Sesion() s: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const d = parsear(usuarioEdicionSchema, body);
    idOr404(id, 'Usuario');
    if (!this.keycloak.habilitado) {
      throw new BadRequestException('La gestión de usuarios no está configurada en este ambiente');
    }
    if (id === s.id && (d.activo === false || (d.rol !== undefined && d.rol !== 'administrador'))) {
      throw new BadRequestException(
        'No puedes quitarte tu propio acceso de administrador ni desactivarte',
      );
    }

    const actual = await this.keycloak.obtener(id);
    const rol = d.rol ?? actual.rol;
    let centro = d.centro !== undefined ? d.centro : actual.centro;
    if (rol !== 'funcionaria') centro = null; // el centro solo tiene sentido para la funcionaria
    if (rol === 'funcionaria') {
      if (!centro) throw new BadRequestException('La funcionaria debe tener un centro asignado');
      const c = await this.prisma.centro.findUnique({ where: { codigo: centro } });
      if (!c || !c.activo) throw new BadRequestException('El centro no existe o está inactivo');
    }

    const cambios = {
      ...(d.rol !== undefined ? { rol: d.rol } : {}),
      ...(centro !== actual.centro ? { centro } : {}),
      ...(d.activo !== undefined ? { activo: d.activo } : {}),
    };
    const u =
      Object.keys(cambios).length > 0 ? await this.keycloak.actualizar(id, cambios) : actual;

    // Espejo local: el cambio de activación debe valer ya para el guard, sin esperar un nuevo ingreso.
    const centroDb = u.centro
      ? await this.prisma.centro.findUnique({ where: { codigo: u.centro } })
      : null;
    await this.prisma.usuario.updateMany({
      where: { keycloakId: id },
      data: { activo: u.activo, ...(u.rol ? { rol: u.rol } : {}), centroId: centroDb?.id ?? null },
    });
    this.activos.invalidar(id);
    await this.auditar(s, req, 'usuario.actualizar', 'usuario', id, { cambios });
    return u;
  }

  // ----------------------------------------------------------------------------------- demo

  @Get('demo')
  estadoDemo() {
    return { disponible: this.demo.disponible };
  }

  /** SOLO en DEMO. Exige escribir RESTABLECER: es una acción que borra todos los datos operativos. */
  @Post('demo/restablecer')
  restablecerDemo(@Body() body: unknown, @Sesion() s: SesionUsuario, @Req() req: RequestConSesion) {
    const d = parsear(demoSchema, body);
    return this.demo.restablecer(s.id, d.sembrar, req.ip);
  }
}
