import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import {
  CODESYSTEMS_ESTATICOS,
  bundleSearchset,
  citaAFhir,
  llamadaAFhir,
  liberacionAFhir,
  mensajeAFhir,
  respuestaCitaAFhir,
  tareaContactoAFhir,
  codeSystemMotivos,
  construirCapabilityStatement,
  operationOutcome,
  organizacionAFhir,
  pacienteAFhir,
  practitionerAFhir,
  practitionerRoleAFhir,
  ubicacionAFhir,
} from '@bh/fhir';
import { normalizarRut, normalizarFecha, resolverAlcance, type SesionUsuario } from '@bh/shared';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CifradoService } from '../cifrado/cifrado.service';
import { Publico, RequiereModulo, Sesion, type RequestConSesion } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';
import { CONFIG } from '../tokens';
import type { Config } from '../config';

const FHIR_JSON = 'application/fhir+json; charset=utf-8';
const ID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fachada FHIR R4 (ADR-001 §2.3). S1: recursos de referencia (centros, profesionales, códigos).
 * Los errores devuelven OperationOutcome en el cuerpo.
 */
@Controller('fhir/R4')
export class FhirController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  private get base() {
    return `${this.config.baseUrl}/fhir/R4`;
  }

  /** CapabilityStatement público por convención FHIR. */
  @Get('metadata')
  @Publico()
  @Header('Content-Type', FHIR_JSON)
  metadata() {
    return construirCapabilityStatement({
      version: this.config.version,
      fecha: new Date().toISOString(),
      baseUrl: this.base,
    });
  }

  @Get('Organization')
  @Header('Content-Type', FHIR_JSON)
  async organizaciones(@Sesion() s: SesionUsuario) {
    const centros = await this.centrosVisibles(s);
    return bundleSearchset(centros.map(organizacionAFhir), this.base);
  }

  @Get('Organization/:id')
  @Header('Content-Type', FHIR_JSON)
  async organizacion(@Param('id') id: string, @Sesion() s: SesionUsuario) {
    return organizacionAFhir(await this.centroVisible(id, s));
  }

  @Get('Location')
  @Header('Content-Type', FHIR_JSON)
  async ubicaciones(@Sesion() s: SesionUsuario) {
    const centros = await this.centrosVisibles(s);
    return bundleSearchset(centros.map(ubicacionAFhir), this.base);
  }

  @Get('Location/:id')
  @Header('Content-Type', FHIR_JSON)
  async ubicacion(@Param('id') id: string, @Sesion() s: SesionUsuario) {
    return ubicacionAFhir(await this.centroVisible(id, s));
  }

  @Get('Practitioner')
  @Header('Content-Type', FHIR_JSON)
  async profesionales(@Sesion() s: SesionUsuario, @Query('organization') org?: string) {
    const profs = await this.profesionalesVisibles(s, org);
    return bundleSearchset(profs.map(practitionerAFhir), this.base);
  }

  @Get('Practitioner/:id')
  @Header('Content-Type', FHIR_JSON)
  async profesional(@Param('id') id: string, @Sesion() s: SesionUsuario) {
    const [p] = (await this.profesionalesVisibles(s)).filter((x) => x.id === id);
    if (!p) throw this.noEncontrado('Practitioner', id);
    return practitionerAFhir(p);
  }

  @Get('PractitionerRole')
  @Header('Content-Type', FHIR_JSON)
  async roles(@Sesion() s: SesionUsuario, @Query('organization') org?: string) {
    const profs = await this.profesionalesVisibles(s, org);
    return bundleSearchset(profs.map(practitionerRoleAFhir), this.base);
  }

  @Get('PractitionerRole/:id')
  @Header('Content-Type', FHIR_JSON)
  async rol(@Param('id') id: string, @Sesion() s: SesionUsuario) {
    const [p] = (await this.profesionalesVisibles(s)).filter((x) => x.id === id);
    if (!p) throw this.noEncontrado('PractitionerRole', id);
    return practitionerRoleAFhir(p);
  }

  @Get('CodeSystem/:id')
  @Header('Content-Type', FHIR_JSON)
  async codeSystem(@Param('id') id: string) {
    if (id === 'motivo-llamada') {
      const motivos = await this.prisma.motivoLlamada.findMany({
        where: { activo: true },
        orderBy: { orden: 'asc' },
      });
      return codeSystemMotivos(motivos);
    }
    const f = CODESYSTEMS_ESTATICOS[id];
    if (!f) throw this.noEncontrado('CodeSystem', id);
    return f();
  }

  // ---------------------------------------------------------------- Appointment y Patient (S2)

  /** Búsqueda: ?date=AAAA-MM-DD (obligatorio) y opcionalmente ?location=<id de centro>. Máx. 500. */
  @Get('Appointment')
  @RequiereModulo('pendientes')
  @Header('Content-Type', FHIR_JSON)
  async citas(
    @Sesion() s: SesionUsuario,
    @Query('date') date?: string,
    @Query('location') location?: string,
  ) {
    const fecha = date ? normalizarFecha(date) : null;
    if (!fecha) {
      throw new BadRequestException(
        operationOutcome('error', 'required', 'El parámetro date (AAAA-MM-DD) es obligatorio'),
      );
    }
    const centros = (await this.centrosVisibles(s)).map((c) => c.id);
    const ids = location ? centros.filter((id) => id === location) : centros;
    const citas = await this.prisma.cita.findMany({
      where: { centroId: { in: ids }, fecha: new Date(`${fecha}T00:00:00.000Z`) },
      orderBy: [{ hora: 'asc' }],
      take: 500,
    });
    return bundleSearchset(
      citas.map((c) => citaAFhir(this.citaDominio(c))),
      this.base,
    );
  }

  @Get('Appointment/:id')
  @RequiereModulo('pendientes')
  @Header('Content-Type', FHIR_JSON)
  async cita(@Param('id') id: string, @Sesion() s: SesionUsuario) {
    const centros = (await this.centrosVisibles(s)).map((c) => c.id);
    const cita = ID_UUID.test(id)
      ? await this.prisma.cita.findFirst({ where: { id, centroId: { in: centros } } })
      : null;
    if (!cita) throw this.noEncontrado('Appointment', id);
    return citaAFhir(this.citaDominio(cita));
  }

  /** Un paciente es visible si tiene al menos una cita en un centro del alcance del usuario. */
  @Get('Patient/:id')
  @RequiereModulo('pendientes')
  @Header('Content-Type', FHIR_JSON)
  async paciente(
    @Param('id') id: string,
    @Sesion() s: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const centros = (await this.centrosVisibles(s)).map((c) => c.id);
    const p = ID_UUID.test(id)
      ? await this.prisma.paciente.findFirst({
          where: { id, citas: { some: { centroId: { in: centros } } } },
        })
      : null;
    if (!p) throw this.noEncontrado('Patient', id);
    await this.auditarLecturaPaciente(s, p.id, req.ip);
    return this.pacienteFhir(p);
  }

  /** ?identifier=<RUN> o <sistema>|<RUN>. */
  @Get('Patient')
  @RequiereModulo('pendientes')
  @Header('Content-Type', FHIR_JSON)
  async buscarPacientes(
    @Sesion() s: SesionUsuario,
    @Req() req: RequestConSesion,
    @Query('identifier') identifier?: string,
  ) {
    const valor = identifier?.split('|').at(-1) ?? '';
    const rut = normalizarRut(valor);
    if (!rut) {
      throw new BadRequestException(
        operationOutcome(
          'error',
          'invalid',
          'identifier debe ser un RUN válido (con dígito verificador)',
        ),
      );
    }
    const centros = (await this.centrosVisibles(s)).map((c) => c.id);
    const p = await this.prisma.paciente.findFirst({
      where: { rut, citas: { some: { centroId: { in: centros } } } },
    });
    if (!p) return bundleSearchset([], this.base);
    await this.auditarLecturaPaciente(s, p.id, req.ip);
    return bundleSearchset([this.pacienteFhir(p)], this.base);
  }

  private pacienteFhir(p: {
    id: string;
    rut: string;
    nombre: string;
    telefonoCifrado: string | null;
    fechaNacimiento: Date | null;
    sexo: 'M' | 'F' | null;
  }) {
    return pacienteAFhir(
      {
        rut: p.rut,
        nombre: p.nombre,
        sexo: p.sexo,
        telefono: p.telefonoCifrado ? this.cifrado.descifrar(p.telefonoCifrado) : null,
        fechaNacimiento: p.fechaNacimiento?.toISOString().slice(0, 10) ?? null,
      },
      p.id,
    );
  }

  /** Leer datos de un paciente queda en la bitácora (sin RUT ni nombre: solo el id interno). */
  private async auditarLecturaPaciente(s: SesionUsuario, pacienteId: string, ip?: string) {
    await this.auditoria.registrar({
      usuarioId: s.id,
      accion: 'paciente.leer',
      recurso: 'paciente',
      recursoId: pacienteId,
      ...(ip ? { ip } : {}),
    });
  }

  private citaDominio(c: {
    id: string;
    centroId: string;
    pacienteId: string;
    profesionalId: string | null;
    profesionalNombre: string;
    fecha: Date;
    hora: string;
    prestacion: string;
    tipo: 'cronico' | 'morbilidad';
  }) {
    return { ...c, fecha: c.fecha.toISOString().slice(0, 10) };
  }

  // ---------------------------------------------------------------- Task, Communication, AppointmentResponse (S3)
  // Búsquedas por cita: ?focus=Appointment/<id> (Task) o ?appointment=<id>. La cita debe ser visible
  // para el usuario (su centro); si no, se responde como si no existiera.

  /** Tarea de contacto de la cita y, si el paciente dijo «No», la tarea «liberar hora en AVIS». */
  @Get('Task')
  @RequiereModulo('pendientes')
  @Header('Content-Type', FHIR_JSON)
  async tareas(
    @Sesion() s: SesionUsuario,
    @Query('focus') focus?: string,
    @Query('appointment') appointment?: string,
  ) {
    const cita = await this.citaDeBusqueda(s, focus ?? appointment);
    const [contacto, liberacion] = await Promise.all([
      this.prisma.tareaContacto.findUnique({ where: { citaId: cita.id } }),
      this.prisma.liberacion.findUnique({ where: { citaId: cita.id } }),
    ]);
    const recursos = [
      ...(contacto
        ? [{ ...tareaContactoAFhir({ id: contacto.id, estado: contacto.estado }, cita.id) }]
        : []),
      ...(liberacion ? [liberacionAFhir(liberacion)] : []),
    ];
    return bundleSearchset(recursos, this.base);
  }

  @Get('Communication')
  @RequiereModulo('pendientes')
  @Header('Content-Type', FHIR_JSON)
  async comunicaciones(
    @Sesion() s: SesionUsuario,
    @Req() req: RequestConSesion,
    @Query('appointment') appointment?: string,
    @Query('patient') patient?: string,
  ) {
    if (patient) return this.comunicacionesDePaciente(s, patient, req.ip);
    const cita = await this.citaDeBusqueda(s, appointment);
    const mensajes = await this.prisma.mensaje.findMany({
      where: { citaId: cita.id },
      orderBy: { creadoEn: 'asc' },
    });
    return bundleSearchset(mensajes.map(mensajeAFhir), this.base);
  }

  /**
   * Todo el contacto con un paciente: mensajes de WhatsApp y llamadas (entrantes y salientes),
   * limitado a los centros del usuario. Leerlo queda auditado, como leer al paciente.
   */
  private async comunicacionesDePaciente(s: SesionUsuario, valor: string, ip?: string) {
    const id = valor.split('/').at(-1) ?? '';
    if (!ID_UUID.test(id)) {
      throw new BadRequestException(
        operationOutcome(
          'error',
          'invalid',
          'patient debe ser un id: ?patient=<id> o Patient/<id>',
        ),
      );
    }
    const centros = (await this.centrosVisibles(s)).map((c) => c.id);
    const visible = await this.prisma.paciente.findFirst({
      where: { id, citas: { some: { centroId: { in: centros } } } },
      select: { id: true },
    });
    if (!visible) throw this.noEncontrado('Patient', id);
    await this.auditarLecturaPaciente(s, id, ip);

    const [mensajes, entrantes, salientes] = await Promise.all([
      this.prisma.mensaje.findMany({
        where: { pacienteId: id, cita: { centroId: { in: centros } } },
        orderBy: { creadoEn: 'asc' },
      }),
      this.prisma.llamadaEntrante.findMany({
        where: { pacienteId: id, centroId: { in: centros } },
        include: { motivo: { select: { codigo: true } } },
        orderBy: { creadaEn: 'asc' },
      }),
      this.prisma.llamadaSaliente.findMany({
        where: { cita: { pacienteId: id, centroId: { in: centros } } },
        include: { cita: { select: { centroId: true } } },
        orderBy: { creadaEn: 'asc' },
      }),
    ]);
    const recursos = [
      ...mensajes.map(mensajeAFhir),
      ...entrantes.map((l) =>
        llamadaAFhir({
          id: l.id,
          direccion: 'entrante',
          centroId: l.centroId,
          pacienteId: id,
          codigo: l.motivo.codigo,
          creadaEn: l.creadaEn,
        }),
      ),
      ...salientes.map((l) =>
        llamadaAFhir({
          id: l.id,
          direccion: 'saliente',
          centroId: l.cita.centroId,
          pacienteId: id,
          citaId: l.citaId,
          codigo: l.resultado,
          creadaEn: l.creadaEn,
        }),
      ),
    ];
    return bundleSearchset(recursos, this.base);
  }

  @Get('AppointmentResponse')
  @RequiereModulo('pendientes')
  @Header('Content-Type', FHIR_JSON)
  async respuestas(@Sesion() s: SesionUsuario, @Query('appointment') appointment?: string) {
    const cita = await this.citaDeBusqueda(s, appointment);
    const t = await this.prisma.tareaContacto.findUnique({ where: { citaId: cita.id } });
    const recursos = t?.respuesta
      ? [
          respuestaCitaAFhir({
            id: t.id,
            citaId: cita.id,
            pacienteId: cita.pacienteId,
            respuesta: t.respuesta,
            respondidoEn: t.respondidoEn,
          }),
        ]
      : [];
    return bundleSearchset(recursos, this.base);
  }

  /** Cita visible para el usuario a partir de `Appointment/<id>` o `<id>`. */
  private async citaDeBusqueda(s: SesionUsuario, valor?: string) {
    const id = valor?.split('/').at(-1) ?? '';
    if (!ID_UUID.test(id)) {
      throw new BadRequestException(
        operationOutcome(
          'error',
          'required',
          'Indica la cita: ?appointment=<id> (o ?focus=Appointment/<id>)',
        ),
      );
    }
    const centros = (await this.centrosVisibles(s)).map((c) => c.id);
    const cita = await this.prisma.cita.findFirst({ where: { id, centroId: { in: centros } } });
    if (!cita) throw this.noEncontrado('Appointment', id);
    return cita;
  }

  // ---------------------------------------------------------------- helpers de alcance

  private async centrosVisibles(s: SesionUsuario) {
    const alcance = resolverAlcance(s);
    if (alcance.tipo === 'prohibido') throw this.prohibido(alcance.motivo);
    return this.prisma.centro.findMany({
      where: { ...(alcance.tipo === 'centro' ? { codigo: alcance.centroId } : {}) },
      orderBy: { nombre: 'asc' },
    });
  }

  private async centroVisible(id: string, s: SesionUsuario) {
    const centro = (await this.centrosVisibles(s)).find((c) => c.id === id);
    // Para un centro ajeno respondemos 404, igual que si no existiera (no se revela su existencia).
    if (!centro) throw this.noEncontrado('Organization/Location', id);
    return centro;
  }

  private async profesionalesVisibles(s: SesionUsuario, organizationId?: string) {
    const centros = await this.centrosVisibles(s);
    const ids = centros.map((c) => c.id).filter((id) => !organizationId || id === organizationId);
    return this.prisma.profesional.findMany({
      where: { centroId: { in: ids } },
      orderBy: { nombre: 'asc' },
    });
  }

  private noEncontrado(tipo: string, id: string) {
    return new NotFoundException(
      operationOutcome('error', 'not-found', `${tipo}/${id} no existe o no tienes acceso`),
    );
  }

  private prohibido(motivo: string) {
    return new ForbiddenException(operationOutcome('error', 'forbidden', motivo));
  }
}
