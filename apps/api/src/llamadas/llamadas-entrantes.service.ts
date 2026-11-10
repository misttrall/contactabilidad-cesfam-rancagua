import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  MOTIVO_OTROS,
  edadCumplida,
  enmascararRut,
  enmascararTelefono,
  esAdultoMayor,
  instanteSantiago,
  normalizarRut,
  partesSantiago,
  type FiltrosHistorial,
  type RegistroEntrante,
} from '@bh/shared';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CifradoService } from '../cifrado/cifrado.service';
import type { Reloj } from '../mensajeria/procesador.service';
import { PrismaService } from '../prisma/prisma.service';
import { RELOJ } from '../tokens';

const sumarDia = (fecha: string): string => {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
};

@Injectable()
export class LlamadasEntrantesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  /**
   * Busca al paciente por RUT entre los cargados EN ESTE CENTRO (con al menos una cita allí).
   * Un paciente que solo tiene citas en otro centro se trata como «no encontrado».
   * Devuelve datos enmascarados; la búsqueda queda auditada (sin el RUT).
   */
  async buscar(usuarioId: string, centroId: string, rut: string, ip?: string) {
    const hoy = partesSantiago(this.reloj.ahora()).fecha;
    const p = await this.prisma.paciente.findFirst({
      where: { rut, citas: { some: { centroId } } },
      select: { id: true, nombre: true, telefonoCifrado: true, fechaNacimiento: true },
    });
    await this.auditoria.registrar({
      usuarioId,
      accion: 'paciente.buscar',
      recurso: 'paciente',
      ...(p ? { recursoId: p.id } : {}),
      centroId,
      ...(ip ? { ip } : {}),
      detalle: { encontrado: p !== null },
    });
    if (!p) return { encontrado: false as const };

    const proximas = await this.prisma.cita.findMany({
      where: { pacienteId: p.id, centroId, fecha: { gte: new Date(`${hoy}T00:00:00.000Z`) } },
      include: { tarea: true },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
      take: 5,
    });
    const nac = p.fechaNacimiento?.toISOString().slice(0, 10);
    const edad = nac ? edadCumplida(nac, hoy) : null;
    return {
      encontrado: true as const,
      paciente: {
        id: p.id,
        nombre: p.nombre,
        edad,
        adultoMayor: edad !== null && esAdultoMayor(edad),
        telefono: p.telefonoCifrado
          ? enmascararTelefono(this.cifrado.descifrar(p.telefonoCifrado))
          : null,
      },
      proximasCitas: proximas.map((c) => ({
        fecha: c.fecha.toISOString().slice(0, 10),
        hora: c.hora,
        profesional: c.profesionalNombre,
        estado: c.tarea?.estado ?? 'sin_enviar',
      })),
    };
  }

  /** Registra la llamada. Si el paciente no está cargado en el centro, queda solo con el RUT. */
  async registrar(usuarioId: string, centroId: string, dto: RegistroEntrante, ip?: string) {
    const motivo = await this.prisma.motivoLlamada.findUnique({ where: { id: dto.motivoId } });
    if (!motivo || !motivo.activo)
      throw new BadRequestException('El motivo no existe o está inactivo');
    if (motivo.codigo === MOTIVO_OTROS && !dto.otroMotivo) {
      throw new BadRequestException('Especifica el motivo cuando eliges «Otros»');
    }
    const paciente = await this.prisma.paciente.findFirst({
      where: { rut: dto.rut, citas: { some: { centroId } } },
      select: { id: true },
    });

    const llamada = await this.prisma.llamadaEntrante.create({
      data: {
        centroId,
        rut: dto.rut,
        motivoId: motivo.id,
        usuarioId,
        ...(paciente ? { pacienteId: paciente.id } : {}),
        // El detalle solo existe para «Otros»: no se guarda texto libre de más.
        ...(motivo.codigo === MOTIVO_OTROS && dto.otroMotivo ? { otroMotivo: dto.otroMotivo } : {}),
        ...(dto.observacion ? { observacion: dto.observacion } : {}),
        ...(dto.segundos !== undefined ? { segundos: dto.segundos } : {}),
      },
    });
    await this.auditoria.registrar({
      usuarioId,
      accion: 'llamada_entrante.registrar',
      recurso: 'llamada_entrante',
      recursoId: llamada.id,
      centroId,
      ...(ip ? { ip } : {}),
      detalle: {
        motivo: motivo.codigo,
        pacienteEncontrado: paciente !== null,
        ...(dto.segundos !== undefined ? { segundos: dto.segundos } : {}),
      },
    });
    return {
      id: llamada.id,
      creadaEn: llamada.creadaEn,
      pacienteEncontrado: paciente !== null,
    };
  }

  /** Historial con filtros y paginación en el servidor. `centroId` null = todos (encargado/admin). */
  async historial(centroId: string | null, f: FiltrosHistorial) {
    const where: Prisma.LlamadaEntranteWhereInput = {
      ...(centroId ? { centroId } : {}),
      ...(f.motivoId ? { motivoId: f.motivoId } : {}),
      ...(f.desde || f.hasta
        ? {
            creadaEn: {
              ...(f.desde ? { gte: new Date(instanteSantiago(f.desde, '00:00')) } : {}),
              ...(f.hasta ? { lt: new Date(instanteSantiago(sumarDia(f.hasta), '00:00')) } : {}),
            },
          }
        : {}),
    };
    if (f.q) {
      // Un RUT válido busca exacto; cualquier otra cosa busca por nombre del paciente.
      const rut = normalizarRut(f.q);
      where.AND = rut
        ? [{ rut }]
        : [{ paciente: { is: { nombre: { contains: f.q, mode: 'insensitive' } } } }];
    }

    const [total, filas] = await Promise.all([
      this.prisma.llamadaEntrante.count({ where }),
      this.prisma.llamadaEntrante.findMany({
        where,
        orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
        skip: (f.pagina - 1) * f.tam,
        take: f.tam,
        include: {
          centro: { select: { codigo: true } },
          motivo: { select: { descripcion: true } },
          paciente: { select: { nombre: true } },
        },
      }),
    ]);

    const subs = [...new Set(filas.map((l) => l.usuarioId))];
    const usuarios = await this.prisma.usuario.findMany({
      where: { keycloakId: { in: subs } },
      select: { keycloakId: true, nombre: true },
    });
    const nombre = new Map(usuarios.map((u) => [u.keycloakId, u.nombre]));

    return {
      total,
      pagina: f.pagina,
      tam: f.tam,
      paginas: Math.max(1, Math.ceil(total / f.tam)),
      filas: filas.map((l) => ({
        id: l.id,
        creadaEn: l.creadaEn,
        centro: l.centro.codigo,
        paciente: l.paciente?.nombre ?? null,
        rut: enmascararRut(l.rut),
        motivo: l.motivo.descripcion,
        otroMotivo: l.otroMotivo,
        observacion: l.observacion,
        registradoPor: nombre.get(l.usuarioId) ?? 'Usuario',
        segundos: l.segundos,
      })),
    };
  }
}
