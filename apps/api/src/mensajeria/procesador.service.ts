import { Inject, Injectable } from '@nestjs/common';
import {
  PLANTILLAS,
  dentroDeVentana,
  parametrosPlantilla,
  payloadBoton,
  proximoInstanteEnVentana,
  textoReagendamiento,
} from '@bh/shared';
import { CifradoService } from '../cifrado/cifrado.service';
import type { Config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { CANAL, CONFIG, RELOJ } from '../tokens';
import { ErrorCanal, telefonoParaWhatsapp, type CanalMensajeria } from './canal';
import type { ProcesadorDeMensajes, ResultadoProceso } from './cola';
import { ParametrosService } from './parametros.service';

export interface Reloj {
  ahora(): Date;
}

/**
 * Envía UN mensaje de la cola. Reglas (en este orden):
 *  1. si ya no está «en cola», no hace nada (reintentos o duplicados);
 *  2. si el paciente pidió la baja, o la cita ya cambió de estado, no se envía;
 *  3. los mensajes de contacto solo salen dentro del horario permitido (si no, se reprograma);
 *  4. un error PERMANENTE del canal deja el mensaje «fallido» y la cita en «Sin respuesta» para que
 *     una funcionaria llame; uno TRANSITORIO se relanza para que la cola reintente.
 * El envío es «al menos una vez»: si la API de WhatsApp acepta el mensaje y el proceso cae antes de
 * guardarlo, un reintento podría duplicarlo (la Cloud API no ofrece clave de idempotencia).
 */
@Injectable()
export class ProcesadorEnvio implements ProcesadorDeMensajes {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(CANAL) private readonly canal: CanalMensajeria,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async procesar(mensajeId: string): Promise<ResultadoProceso> {
    const m = await this.prisma.mensaje.findUnique({
      where: { id: mensajeId },
      include: { cita: { include: { tarea: true, centro: true } }, paciente: true },
    });
    if (!m || m.estado !== 'en_cola') return { tipo: 'omitido', motivo: 'ya_procesado' };

    const ahora = this.reloj.ahora();
    const estadoTarea = m.cita.tarea?.estado;

    if (m.paciente.whatsappBaja) return this.descartar(m.id, m.tipo, m.citaId, 'BAJA', true);
    if (m.tipo === 'confirmacion' && estadoTarea !== 'sin_enviar') {
      return this.descartar(m.id, m.tipo, m.citaId, 'ESTADO', false);
    }
    if (m.tipo === 'recordatorio' && estadoTarea !== 'enviado') {
      return this.descartar(m.id, m.tipo, m.citaId, 'ESTADO', false);
    }

    // Respetar el horario solo en mensajes que inician la conversación.
    if (m.tipo !== 'reagendamiento') {
      const ventana = await this.parametros.leer('envio.ventana_horaria');
      if (!dentroDeVentana(ahora, ventana)) {
        const proximo = proximoInstanteEnVentana(ahora, ventana);
        return {
          tipo: 'reprogramar',
          retrasoMs: Math.max(proximo.getTime() - ahora.getTime(), 1000),
        };
      }
    }

    const telefono = m.paciente.telefonoCifrado
      ? this.cifrado.descifrar(m.paciente.telefonoCifrado)
      : null;
    if (!telefono) return this.descartar(m.id, m.tipo, m.citaId, 'SIN_TELEFONO', true);
    const para = telefonoParaWhatsapp(telefono);

    try {
      let proveedorId: string;
      if (m.tipo === 'reagendamiento') {
        const info = await this.parametros.leer('mensajes.reagendamiento_info');
        ({ proveedorId } = await this.canal.enviarTexto({
          para,
          texto: textoReagendamiento(info, m.cita.centro.telefonoContacto),
        }));
      } else {
        const datos = {
          centro: m.cita.centro.nombre,
          fecha: m.cita.fecha.toISOString().slice(0, 10),
          hora: m.cita.hora,
        };
        ({ proveedorId } = await this.canal.enviarPlantilla({
          para,
          plantilla:
            m.tipo === 'confirmacion'
              ? this.config.whatsapp.plantillaConfirmacion
              : this.config.whatsapp.plantillaRecordatorio,
          idioma: PLANTILLAS.confirmacion.idioma,
          parametros: parametrosPlantilla(datos),
          payloadsBotones: [payloadBoton('SI', m.id), payloadBoton('NO', m.id)],
        }));
      }
      await this.prisma.mensaje.update({
        where: { id: m.id },
        data: { estado: 'enviado', proveedorId, enviadoEn: ahora, intentos: { increment: 1 } },
      });
      if (m.tipo === 'confirmacion') {
        await this.prisma.tareaContacto.updateMany({
          where: { citaId: m.citaId, estado: 'sin_enviar' },
          data: { estado: 'enviado', enviadoEn: ahora, formaContacto: 'whatsapp' },
        });
      }
      return { tipo: 'enviado' };
    } catch (e) {
      if (e instanceof ErrorCanal && e.permanente) {
        return this.descartar(m.id, m.tipo, m.citaId, e.codigo, true);
      }
      // Transitorio (o error inesperado): se anota el intento y la cola reintenta.
      await this.prisma.mensaje
        .update({
          where: { id: m.id },
          data: {
            intentos: { increment: 1 },
            errorCodigo: e instanceof ErrorCanal ? e.codigo : 'ERROR',
          },
        })
        .catch(() => undefined);
      throw e;
    }
  }

  /** La cola agotó los reintentos: se da por fallido y la cita pasa a la lista de llamadas. */
  async marcarFallidoDefinitivo(mensajeId: string, codigo: string): Promise<void> {
    const m = await this.prisma.mensaje.findUnique({ where: { id: mensajeId } });
    if (!m || m.estado !== 'en_cola') return;
    await this.descartar(m.id, m.tipo, m.citaId, codigo, true);
  }

  private async descartar(
    mensajeId: string,
    tipo: string,
    citaId: string,
    codigo: string,
    aSinRespuesta: boolean,
  ): Promise<ResultadoProceso> {
    const ahora = this.reloj.ahora();
    await this.prisma.mensaje.update({
      where: { id: mensajeId },
      data: { estado: 'fallido', errorCodigo: codigo, fallidoEn: ahora },
    });
    // Sin forma de llegar por WhatsApp -> a la lista de llamadas. Nunca se cancela (RN-01).
    if (aSinRespuesta && tipo === 'confirmacion') {
      await this.prisma.tareaContacto.updateMany({
        where: { citaId, estado: 'sin_enviar' },
        data: { estado: 'sin_respuesta' },
      });
    }
    return { tipo: 'fallido', codigo };
  }
}
