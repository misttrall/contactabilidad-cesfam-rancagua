import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { proximoInstanteEnVentana, textoConfirmacion } from '@bh/shared';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { Config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { COLA_ENVIOS, CONFIG, RELOJ } from '../tokens';
import type { ColaEnvios } from './cola';
import { ParametrosService } from './parametros.service';
import type { Reloj } from './procesador.service';

export interface Clasificacion {
  elegibles: { citaId: string; pacienteId: string; fecha: string; hora: string }[];
  sinTelefono: string[];
  baja: string[];
  /** Ya enviadas, con mensaje existente, o en un estado distinto de «sin enviar». */
  estado: string[];
  noEncontradas: number;
  centroNombre: string;
}

const LOTE_COLA = 500;

@Injectable()
export class EnvioService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(COLA_ENVIOS) private readonly cola: ColaEnvios,
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /**
   * Decide, cita por cita, qué se enviaría. Solo se consideran citas DEL CENTRO indicado: un id de
   * otro centro cuenta como «no encontrada» (no se revela que existe).
   */
  async clasificar(centroId: string, citaIds: string[]): Promise<Clasificacion> {
    const unicos = [...new Set(citaIds)];
    const citas = await this.prisma.cita.findMany({
      where: { id: { in: unicos }, centroId },
      include: {
        tarea: true,
        centro: { select: { nombre: true } },
        paciente: { select: { telefonoCifrado: true, whatsappBaja: true } },
        mensajes: { where: { tipo: 'confirmacion' }, select: { id: true } },
      },
    });
    const r: Clasificacion = {
      elegibles: [],
      sinTelefono: [],
      baja: [],
      estado: [],
      noEncontradas: unicos.length - citas.length,
      centroNombre: citas[0]?.centro.nombre ?? '',
    };
    for (const c of citas) {
      if (c.tarea?.estado !== 'sin_enviar' || c.mensajes.length > 0) r.estado.push(c.id);
      else if (c.paciente.whatsappBaja) r.baja.push(c.id);
      else if (!c.paciente.telefonoCifrado) r.sinTelefono.push(c.id);
      else {
        r.elegibles.push({
          citaId: c.id,
          pacienteId: c.pacienteId,
          fecha: c.fecha.toISOString().slice(0, 10),
          hora: c.hora,
        });
      }
    }
    return r;
  }

  /** Resumen para el diálogo de confirmación: no escribe nada. */
  async previsualizar(centro: { id: string; nombre: string }, citaIds: string[]) {
    const c = await this.clasificar(centro.id, citaIds);
    const ventana = await this.parametros.leer('envio.ventana_horaria');
    const ahora = this.reloj.ahora();
    const programado = proximoInstanteEnVentana(ahora, ventana);
    const primera = c.elegibles[0];
    return {
      aEnviar: c.elegibles.length,
      sinTelefono: c.sinTelefono.length,
      baja: c.baja.length,
      yaEnviadasOEnOtroEstado: c.estado.length + c.noEncontradas,
      /** El texto que recibirá el paciente (sin nombre, profesional ni prestación). */
      mensaje: primera
        ? textoConfirmacion({ centro: centro.nombre, fecha: primera.fecha, hora: primera.hora })
        : null,
      /** Si es posterior a ahora, los envíos esperan al inicio del horario permitido. */
      programadoPara: programado.getTime() > ahora.getTime() ? programado.toISOString() : null,
      ventana,
    };
  }

  async crear(
    usuarioId: string,
    centro: { id: string; nombre: string },
    citaIds: string[],
    ip?: string,
  ) {
    const c = await this.clasificar(centro.id, citaIds);
    const ahora = this.reloj.ahora();
    const ventana = await this.parametros.leer('envio.ventana_horaria');
    const programado = proximoInstanteEnVentana(ahora, ventana);
    const retrasoMs = Math.max(programado.getTime() - ahora.getTime(), 0);
    const ids = c.elegibles.map(() => randomUUID());

    const { envio, encolados } = await this.prisma.$transaction(
      async (tx) => {
        const envio = await tx.envio.create({
          data: {
            centroId: centro.id,
            usuarioId,
            solicitadas: new Set(citaIds).size,
            encoladas: 0,
            omitidasSinTelefono: c.sinTelefono.length,
            omitidasBaja: c.baja.length,
            omitidasEstado: c.estado.length + c.noEncontradas,
          },
        });
        // (citaId, tipo) es único: si otra persona pulsó «Enviar» a la vez, esas filas se saltan.
        await tx.mensaje.createMany({
          data: c.elegibles.map((e, i) => ({
            id: ids[i]!,
            citaId: e.citaId,
            pacienteId: e.pacienteId,
            envioId: envio.id,
            tipo: 'confirmacion' as const,
            plantilla: this.config.whatsapp.plantillaConfirmacion,
            programadoPara: retrasoMs > 0 ? programado : null,
          })),
          skipDuplicates: true,
        });
        const insertados = (
          await tx.mensaje.findMany({ where: { id: { in: ids } }, select: { id: true } })
        ).map((m) => m.id);
        // Sin teléfono o con baja: no hay WhatsApp posible -> directo a la lista de llamadas.
        const aLlamar = [...c.sinTelefono, ...c.baja];
        if (aLlamar.length > 0) {
          await tx.tareaContacto.updateMany({
            where: { citaId: { in: aLlamar }, estado: 'sin_enviar' },
            data: { estado: 'sin_respuesta' },
          });
        }
        await tx.envio.update({
          where: { id: envio.id },
          data: {
            encoladas: insertados.length,
            omitidasEstado: c.estado.length + c.noEncontradas + (ids.length - insertados.length),
          },
        });
        return { envio, encolados: insertados };
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    // Se encola DESPUÉS de confirmar la transacción: el worker debe poder ver los mensajes.
    for (let i = 0; i < encolados.length; i += LOTE_COLA) {
      await this.cola.encolar(encolados.slice(i, i + LOTE_COLA), retrasoMs);
    }

    await this.auditoria.registrar({
      usuarioId,
      accion: 'envio.crear',
      recurso: 'envio',
      recursoId: envio.id,
      centroId: centro.id,
      ...(ip ? { ip } : {}),
      detalle: {
        encoladas: encolados.length,
        sinTelefono: c.sinTelefono.length,
        baja: c.baja.length,
        otroEstado: c.estado.length + c.noEncontradas,
      },
    });

    return {
      envioId: envio.id,
      solicitadas: new Set(citaIds).size,
      encoladas: encolados.length,
      omitidasSinTelefono: c.sinTelefono.length,
      omitidasBaja: c.baja.length,
      omitidasEstado: c.estado.length + c.noEncontradas + (ids.length - encolados.length),
      programadoPara: retrasoMs > 0 ? programado.toISOString() : null,
    };
  }

  /** Avance de un envío. `centroId` limita la consulta al alcance del usuario (null = todos). */
  async progreso(envioId: string, centroId: string | null) {
    const envio = await this.prisma.envio.findFirst({
      where: { id: envioId, ...(centroId ? { centroId } : {}) },
    });
    if (!envio) throw new NotFoundException('Envío no encontrado');
    const grupos = await this.prisma.mensaje.groupBy({
      by: ['estado'],
      where: { envioId },
      _count: { _all: true },
    });
    const n = (e: string) => grupos.find((g) => g.estado === e)?._count._all ?? 0;
    const mensajes = {
      en_cola: n('en_cola'),
      enviado: n('enviado'),
      entregado: n('entregado'),
      leido: n('leido'),
      fallido: n('fallido'),
    };
    return {
      id: envio.id,
      creadoEn: envio.creadoEn,
      solicitadas: envio.solicitadas,
      encoladas: envio.encoladas,
      omitidasSinTelefono: envio.omitidasSinTelefono,
      omitidasBaja: envio.omitidasBaja,
      omitidasEstado: envio.omitidasEstado,
      mensajes,
      terminado: mensajes.en_cola === 0,
    };
  }
}
