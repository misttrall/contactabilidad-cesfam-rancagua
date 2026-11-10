import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  edadCumplida,
  enmascararTelefono,
  esAdultoMayor,
  estadoTrasLlamada,
  formatearRut,
  partesSantiago,
  type ResultadoSaliente,
} from '@bh/shared';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CifradoService } from '../cifrado/cifrado.service';
import { ParametrosService } from '../mensajeria/parametros.service';
import type { Reloj } from '../mensajeria/procesador.service';
import { PrismaService } from '../prisma/prisma.service';
import { RELOJ } from '../tokens';

const HORA_MS = 3_600_000;
const ABIERTAS = ['sin_enviar', 'enviado', 'sin_respuesta'] as const;

/** Citas que requieren llamada y el registro del resultado de cada intento. */
@Injectable()
export class PendientesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  /**
   * Cola de llamadas del centro: citas futuras en «Sin respuesta» o «Enviado» cuya espera ya
   * venció (el barrido aún no las pasó). Adultos mayores primero (RN-05), luego por fecha y hora.
   * Una cita con recado o «no ubicado» sigue aquí: nunca se cancela por no contestar (RN-01).
   */
  async listar(centroId: string) {
    const ahora = this.reloj.ahora();
    const horas = await this.parametros.leer('envio.horas_espera_respuesta');
    const hoy = partesSantiago(ahora).fecha;

    const citas = await this.prisma.cita.findMany({
      where: {
        centroId,
        fecha: { gte: new Date(`${hoy}T00:00:00.000Z`) },
        tarea: {
          OR: [
            { estado: 'sin_respuesta' },
            { estado: 'enviado', enviadoEn: { lte: new Date(ahora.getTime() - horas * HORA_MS) } },
          ],
        },
      },
      include: {
        tarea: true,
        paciente: {
          select: {
            id: true,
            nombre: true,
            telefonoCifrado: true,
            fechaNacimiento: true,
            whatsappBaja: true,
          },
        },
        llamadas: { orderBy: { creadaEn: 'desc' }, take: 1 },
        _count: { select: { llamadas: true } },
      },
      take: 1000,
    });

    const filas = citas.map((c) => {
      const nac = c.paciente.fechaNacimiento?.toISOString().slice(0, 10);
      const fecha = c.fecha.toISOString().slice(0, 10);
      const edad = nac ? edadCumplida(nac, fecha) : null;
      const ultima = c.llamadas[0];
      return {
        id: c.id,
        pacienteId: c.paciente.id,
        fecha,
        hora: c.hora,
        paciente: c.paciente.nombre,
        telefono: c.paciente.telefonoCifrado
          ? enmascararTelefono(this.cifrado.descifrar(c.paciente.telefonoCifrado))
          : null,
        profesional: c.profesionalNombre,
        prestacion: c.prestacion,
        tipo: c.tipo,
        subestado: c.tarea?.subestado ?? null,
        // «Enviado» con la espera vencida se muestra ya como «Sin respuesta».
        vencida: c.tarea?.estado === 'enviado',
        adultoMayor: edad !== null && esAdultoMayor(edad),
        bajaWhatsApp: c.paciente.whatsappBaja,
        intentos: c._count.llamadas,
        ultimoIntento: ultima ? { resultado: ultima.resultado, creadaEn: ultima.creadaEn } : null,
      };
    });
    return filas.sort(
      (a, b) =>
        Number(b.adultoMayor) - Number(a.adultoMayor) ||
        a.fecha.localeCompare(b.fecha) ||
        a.hora.localeCompare(b.hora) ||
        a.id.localeCompare(b.id),
    );
  }

  /** Historial de contacto de una cita: mensajes de WhatsApp y llamadas previas con quién las hizo. */
  async contactos(citaId: string, centroId: string | null) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, ...(centroId ? { centroId } : {}) },
      include: {
        tarea: true,
        mensajes: { orderBy: { creadoEn: 'asc' } },
        llamadas: { orderBy: { creadaEn: 'asc' } },
      },
    });
    if (!cita) throw new NotFoundException('Cita no encontrada');

    const subs = [...new Set(cita.llamadas.map((l) => l.usuarioId))];
    const usuarios = await this.prisma.usuario.findMany({
      where: { keycloakId: { in: subs } },
      select: { keycloakId: true, nombre: true },
    });
    const nombre = new Map(usuarios.map((u) => [u.keycloakId, u.nombre]));

    return {
      estado: cita.tarea?.estado ?? 'sin_enviar',
      subestado: cita.tarea?.subestado ?? null,
      mensajes: cita.mensajes.map((m) => ({
        tipo: m.tipo,
        estado: m.estado,
        enviadoEn: m.enviadoEn,
        leidoEn: m.leidoEn,
      })),
      llamadas: cita.llamadas.map((l) => ({
        id: l.id,
        resultado: l.resultado,
        observacion: l.observacion,
        creadaEn: l.creadaEn,
        registradoPor: nombre.get(l.usuarioId) ?? 'Usuario',
      })),
    };
  }

  /**
   * Registra el resultado de una llamada.
   *  - confirmado -> confirmada; cancelado -> cancelada + «liberar hora en AVIS».
   *  - recado / no ubicado -> la cita sigue en «Sin respuesta» (con su subestado): NUNCA cancela.
   * La transición es condicional: si otra persona ya la confirmó o cancelaron, responde 409.
   */
  async registrarResultado(
    usuarioId: string,
    citaId: string,
    centroId: string | null,
    dto: ResultadoSaliente,
    ip?: string,
  ) {
    const ahora = this.reloj.ahora();
    const { estado, subestado } = estadoTrasLlamada(dto.resultado);
    const final = estado === 'confirmado' || estado === 'cancelado';

    const r = await this.prisma.$transaction(async (tx) => {
      const cita = await tx.cita.findFirst({
        where: { id: citaId, ...(centroId ? { centroId } : {}) },
        select: { id: true, centroId: true },
      });
      if (!cita) throw new NotFoundException('Cita no encontrada');

      const upd = await tx.tareaContacto.updateMany({
        where: { citaId, estado: { in: [...ABIERTAS] } },
        data: {
          estado,
          subestado: subestado ?? null,
          ...(final
            ? {
                respuesta: estado === 'confirmado' ? ('si' as const) : ('no' as const),
                respondidoEn: ahora,
                formaContacto: 'llamada' as const,
              }
            : {}),
        },
      });
      if (upd.count === 0) {
        throw new ConflictException('La cita ya está confirmada o cancelada');
      }
      if (estado === 'cancelado') {
        await tx.liberacion.upsert({ where: { citaId }, update: {}, create: { citaId } });
      }
      const llamada = await tx.llamadaSaliente.create({
        data: {
          citaId,
          resultado: dto.resultado,
          usuarioId,
          ...(dto.observacion ? { observacion: dto.observacion } : {}),
        },
      });
      return { llamadaId: llamada.id, centroId: cita.centroId };
    });

    // Sin observación (puede traer datos personales) ni RUT: solo el resultado.
    await this.auditoria.registrar({
      usuarioId,
      accion: 'llamada.registrar',
      recurso: 'cita',
      recursoId: citaId,
      centroId: r.centroId,
      ...(ip ? { ip } : {}),
      detalle: { resultado: dto.resultado },
    });
    return {
      llamadaId: r.llamadaId,
      estado,
      subestado: subestado ?? null,
      liberarEnAvis: estado === 'cancelado',
    };
  }

  /**
   * Muestra el dato completo de un paciente (teléfono o RUT) SOLO bajo demanda. Cada revelación
   * queda en la bitácora de auditoría (quién, cuándo y qué campo; nunca el valor).
   */
  async revelar(
    usuarioId: string,
    pacienteId: string,
    campo: 'telefono' | 'rut',
    centroId: string | null,
    ip?: string,
  ) {
    const p = await this.prisma.paciente.findFirst({
      where: { id: pacienteId, citas: { some: centroId ? { centroId } : {} } },
      select: { id: true, rut: true, telefonoCifrado: true },
    });
    if (!p) throw new NotFoundException('Paciente no encontrado');
    const valor =
      campo === 'rut'
        ? formatearRut(p.rut)
        : p.telefonoCifrado
          ? this.cifrado.descifrar(p.telefonoCifrado)
          : null;
    await this.auditoria.registrar({
      usuarioId,
      accion: 'dato.revelar',
      recurso: 'paciente',
      recursoId: p.id,
      ...(centroId ? { centroId } : {}),
      ...(ip ? { ip } : {}),
      detalle: { campo },
    });
    return { campo, valor };
  }
}
