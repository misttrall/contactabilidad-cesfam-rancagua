import { Inject, Injectable } from '@nestjs/common';
import { COLA_ENVIOS, RELOJ } from '../tokens';
import { PrismaService } from '../prisma/prisma.service';
import type { ColaEnvios } from './cola';
import type { Reloj } from './procesador.service';

export type ResultadoRespuesta = 'si' | 'no' | 'baja' | 'ignorado';

/** Estados desde los cuales una respuesta del paciente es válida (incluye «sin respuesta» tardía). */
const ABIERTOS = ['enviado', 'sin_respuesta'] as const;

/**
 * Aplica lo que el paciente contestó. Todas las transiciones son condicionales (`updateMany` con el
 * estado esperado): una respuesta repetida, o que llega cuando la cita ya está confirmada o
 * cancelada, no cambia nada.
 */
@Injectable()
export class RespuestasService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(COLA_ENVIOS) private readonly cola: ColaEnvios,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  /** «Sí, asistiré»: la cita queda confirmada. */
  async confirmar(citaId: string): Promise<ResultadoRespuesta> {
    const r = await this.prisma.tareaContacto.updateMany({
      where: { citaId, estado: { in: [...ABIERTOS] } },
      data: {
        estado: 'confirmado',
        subestado: null,
        respuesta: 'si',
        respondidoEn: this.reloj.ahora(),
        formaContacto: 'whatsapp',
      },
    });
    return r.count > 0 ? 'si' : 'ignorado';
  }

  /**
   * «No podré asistir»: la tarea queda «cancelado» (intención del paciente) y se crea una
   * «Liberación» para que alguien libere la hora en AVIS, dueño de la agenda. Además se le
   * responde con cómo reagendar.
   */
  async cancelar(citaId: string): Promise<ResultadoRespuesta> {
    const ahora = this.reloj.ahora();
    const mensajeId = await this.prisma.$transaction(async (tx) => {
      const r = await tx.tareaContacto.updateMany({
        where: { citaId, estado: { in: [...ABIERTOS] } },
        data: {
          estado: 'cancelado',
          subestado: null,
          respuesta: 'no',
          respondidoEn: ahora,
          formaContacto: 'whatsapp',
        },
      });
      if (r.count === 0) return null;
      await tx.liberacion.upsert({ where: { citaId }, update: {}, create: { citaId } });
      const cita = await tx.cita.findUniqueOrThrow({ where: { id: citaId } });
      const existente = await tx.mensaje.findUnique({
        where: { citaId_tipo: { citaId, tipo: 'reagendamiento' } },
      });
      if (existente) return null;
      const m = await tx.mensaje.create({
        data: {
          citaId,
          pacienteId: cita.pacienteId,
          tipo: 'reagendamiento',
          plantilla: 'texto_libre',
        },
      });
      return m.id;
    });
    // El mensaje se encola DESPUÉS de confirmar la transacción (si no, el worker podría no verlo).
    if (mensajeId) await this.cola.encolar([mensajeId]);
    return 'no';
  }

  /**
   * El paciente pidió no recibir más mensajes. Se registra la baja de TODOS los pacientes que
   * comparten ese teléfono (la baja es del número) y sus citas abiertas pasan a «Sin respuesta»
   * para que una funcionaria les llame.
   */
  async registrarBaja(
    telefonoHash: string | string[],
    origen = 'paciente_whatsapp',
  ): Promise<number> {
    const ahora = this.reloj.ahora();
    const pacientes = await this.prisma.paciente.findMany({
      where: {
        telefonoHash: Array.isArray(telefonoHash) ? { in: telefonoHash } : telefonoHash,
      },
      select: { id: true, whatsappBaja: true },
    });
    if (pacientes.length === 0) return 0;
    const ids = pacientes.map((p) => p.id);
    await this.prisma.$transaction(async (tx) => {
      const nuevos = pacientes.filter((p) => !p.whatsappBaja).map((p) => p.id);
      if (nuevos.length > 0) {
        await tx.paciente.updateMany({
          where: { id: { in: nuevos } },
          data: { whatsappBaja: true, whatsappBajaEn: ahora },
        });
        await tx.consentimiento.createMany({
          data: nuevos.map((pacienteId) => ({
            pacienteId,
            canal: 'whatsapp',
            estado: 'revocado',
            origen,
          })),
        });
      }
      await tx.tareaContacto.updateMany({
        where: { estado: 'enviado', cita: { pacienteId: { in: ids } } },
        data: { estado: 'sin_respuesta' },
      });
    });
    return ids.length;
  }
}
