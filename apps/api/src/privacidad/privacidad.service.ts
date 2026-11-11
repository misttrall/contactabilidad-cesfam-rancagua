import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CifradoService } from '../cifrado/cifrado.service';
import type { Config } from '../config';
import type { Reloj } from '../mensajeria/procesador.service';
import { PrismaService } from '../prisma/prisma.service';
import { CONFIG, RELOJ } from '../tokens';

export const PREFIJO_ANON = 'ANON-';
const RUT_HUERFANAS = `${PREFIJO_ANON}SIN-PACIENTE`;

/** Resta meses calendario a una fecha (UTC), acotando al último día del mes si hace falta. */
export function restarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha.getTime());
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

export interface ResultadoRetencion {
  corte: string;
  pacientes: number;
  llamadasSinPaciente: number;
  simulacion: boolean;
}

/**
 * Privacidad (Ley 21.719, informe 13.3): retención, anonimización y derechos ARCO+.
 *
 * Anonimizar NO borra la actividad: las citas, mensajes y llamadas se conservan para las
 * estadísticas, pero el paciente deja de ser identificable (nombre, RUT, teléfono y observaciones
 * libres). En la retención automática se conserva el sexo y el año de nacimiento (tramos de edad de
 * los reportes); en una supresión pedida por el titular se borra también eso.
 */
@Injectable()
export class PrivacidadService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  get retencionMeses(): number {
    return this.config.retencionMeses;
  }

  private corte(): Date {
    return restarMeses(this.reloj.ahora(), this.config.retencionMeses);
  }

  private candidatos(corte: Date): Prisma.PacienteWhereInput {
    return {
      NOT: { rut: { startsWith: PREFIJO_ANON } },
      creadoEn: { lt: corte },
      // Sin ninguna cita desde la fecha de corte: el último contacto es anterior al plazo.
      citas: { none: { fecha: { gte: corte } } },
    };
  }

  /** Cuántos registros caerían hoy en la política de retención (sin tocar nada). */
  async estado() {
    const corte = this.corte();
    const [pacientes, llamadasSinPaciente] = await Promise.all([
      this.prisma.paciente.count({ where: this.candidatos(corte) }),
      this.prisma.llamadaEntrante.count({ where: this.huerfanas(corte) }),
    ]);
    return {
      retencionMeses: this.config.retencionMeses,
      corte: corte.toISOString().slice(0, 10),
      pacientesPorAnonimizar: pacientes,
      llamadasSinPacientePorAnonimizar: llamadasSinPaciente,
    };
  }

  private huerfanas(corte: Date): Prisma.LlamadaEntranteWhereInput {
    return { pacienteId: null, creadaEn: { lt: corte }, NOT: { rut: RUT_HUERFANAS } };
  }

  /** Aplica la retención. Idempotente; en lotes para no bloquear la base. */
  async aplicarRetencion(
    opciones: { simular?: boolean; usuarioId?: string; ip?: string } = {},
  ): Promise<ResultadoRetencion> {
    const corte = this.corte();
    const simulacion = opciones.simular ?? false;
    let pacientes = 0;
    for (;;) {
      const lote = await this.prisma.paciente.findMany({
        where: this.candidatos(corte),
        select: { id: true, fechaNacimiento: true },
        orderBy: { id: 'asc' },
        take: 200,
      });
      if (lote.length === 0 || simulacion) {
        if (simulacion) {
          pacientes = await this.prisma.paciente.count({ where: this.candidatos(corte) });
        }
        break;
      }
      for (const p of lote) {
        await this.anonimizarEnTransaccion(p.id, { conservarAnioNacimiento: true });
        pacientes += 1;
      }
    }
    let llamadasSinPaciente: number;
    if (simulacion) {
      llamadasSinPaciente = await this.prisma.llamadaEntrante.count({
        where: this.huerfanas(corte),
      });
    } else {
      llamadasSinPaciente = (
        await this.prisma.llamadaEntrante.updateMany({
          where: this.huerfanas(corte),
          data: { rut: RUT_HUERFANAS, observacion: null, otroMotivo: null },
        })
      ).count;
    }
    const resultado = {
      corte: corte.toISOString().slice(0, 10),
      pacientes,
      llamadasSinPaciente,
      simulacion,
    };
    if (!simulacion) {
      await this.auditoria.registrar({
        usuarioId: opciones.usuarioId,
        accion: 'privacidad.retencion',
        recurso: 'paciente',
        ip: opciones.ip,
        detalle: { ...resultado, retencionMeses: this.config.retencionMeses },
      });
    }
    return resultado;
  }

  /** Supresión pedida por el titular (ARCO+): irreversible, también borra sexo y fecha de nacimiento. */
  async suprimir(
    id: string,
    usuarioId: string,
    motivo: string,
    ip?: string,
  ): Promise<{ id: string }> {
    await this.exigirPaciente(id);
    await this.anonimizarEnTransaccion(id, { conservarAnioNacimiento: false });
    await this.auditoria.registrar({
      usuarioId,
      accion: 'privacidad.suprimir',
      recurso: 'paciente',
      recursoId: id,
      ip,
      // El motivo es texto del administrador (ej. «solicitud ARCO folio 12»): no debe contener datos personales.
      detalle: { motivo: motivo.slice(0, 200) },
    });
    return { id };
  }

  private async anonimizarEnTransaccion(
    id: string,
    op: { conservarAnioNacimiento: boolean },
  ): Promise<void> {
    const anon = `${PREFIJO_ANON}${id.replace(/-/g, '').slice(0, 12)}`;
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.paciente.findUnique({
        where: { id },
        select: { fechaNacimiento: true },
      });
      if (!p) return;
      const nacimiento =
        op.conservarAnioNacimiento && p.fechaNacimiento
          ? new Date(Date.UTC(p.fechaNacimiento.getUTCFullYear(), 0, 1))
          : null;
      await tx.paciente.update({
        where: { id },
        data: {
          rut: anon,
          nombre: 'Paciente anonimizado',
          telefonoCifrado: null,
          telefonoHash: null,
          fechaNacimiento: nacimiento,
          ...(op.conservarAnioNacimiento ? {} : { sexo: null }),
          whatsappBaja: true,
        },
      });
      await tx.llamadaEntrante.updateMany({
        where: { pacienteId: id },
        data: { rut: anon, observacion: null, otroMotivo: null },
      });
      await tx.llamadaSaliente.updateMany({
        where: { cita: { pacienteId: id } },
        data: { observacion: null },
      });
    });
  }

  /** Oposición / bloqueo: el paciente no vuelve a recibir mensajes por WhatsApp (se le llama). */
  async registrarOposicion(id: string, usuarioId: string, ip?: string): Promise<{ id: string }> {
    await this.exigirPaciente(id);
    await this.prisma.$transaction([
      this.prisma.paciente.update({
        where: { id },
        data: { whatsappBaja: true, whatsappBajaEn: this.reloj.ahora() },
      }),
      this.prisma.consentimiento.create({
        data: { pacienteId: id, canal: 'whatsapp', estado: 'revocado', origen: 'arco' },
      }),
    ]);
    await this.auditoria.registrar({
      usuarioId,
      accion: 'privacidad.oposicion',
      recurso: 'paciente',
      recursoId: id,
      ip,
    });
    return { id };
  }

  /**
   * Acceso y portabilidad: todos los datos que el sistema guarda del paciente, en JSON, sin enmascarar.
   * Quien lo pide es el administrador tras verificar la identidad del titular (ver el procedimiento).
   */
  async datosDelTitular(id: string, usuarioId: string, ip?: string) {
    const p = await this.prisma.paciente.findUnique({
      where: { id },
      include: {
        citas: {
          orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
          include: {
            centro: { select: { codigo: true, nombre: true } },
            tarea: true,
            mensajes: true,
            llamadas: true,
          },
        },
        consentimientos: true,
        llamadasEntrantes: { include: { motivo: { select: { descripcion: true } } } },
      },
    });
    if (!p) throw new NotFoundException('Paciente no encontrado');
    await this.auditoria.registrar({
      usuarioId,
      accion: 'privacidad.acceso',
      recurso: 'paciente',
      recursoId: id,
      ip,
    });
    return {
      generadoEn: this.reloj.ahora().toISOString(),
      paciente: {
        id: p.id,
        rut: p.rut,
        nombre: p.nombre,
        telefono: p.telefonoCifrado ? this.cifrado.descifrar(p.telefonoCifrado) : null,
        fechaNacimiento: p.fechaNacimiento?.toISOString().slice(0, 10) ?? null,
        sexo: p.sexo,
        whatsappBaja: p.whatsappBaja,
        creadoEn: p.creadoEn,
      },
      citas: p.citas.map((c) => ({
        id: c.id,
        centro: c.centro.nombre,
        fecha: c.fecha.toISOString().slice(0, 10),
        hora: c.hora,
        profesional: c.profesionalNombre,
        prestacion: c.prestacion,
        tipo: c.tipo,
        estadoContacto: c.tarea?.estado ?? null,
        respuesta: c.tarea?.respuesta ?? null,
        mensajes: c.mensajes.map((m) => ({
          tipo: m.tipo,
          estado: m.estado,
          creadoEn: m.creadoEn,
          enviadoEn: m.enviadoEn,
          leidoEn: m.leidoEn,
        })),
        llamadas: c.llamadas.map((l) => ({
          resultado: l.resultado,
          observacion: l.observacion,
          creadaEn: l.creadaEn,
        })),
      })),
      llamadasEntrantes: p.llamadasEntrantes.map((l) => ({
        motivo: l.motivo.descripcion,
        otroMotivo: l.otroMotivo,
        observacion: l.observacion,
        creadaEn: l.creadaEn,
      })),
      consentimientos: p.consentimientos.map((c) => ({
        canal: c.canal,
        estado: c.estado,
        origen: c.origen,
        registradoEn: c.registradoEn,
      })),
    };
  }

  private async exigirPaciente(id: string) {
    const existe = await this.prisma.paciente.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new NotFoundException('Paciente no encontrado');
  }
}
