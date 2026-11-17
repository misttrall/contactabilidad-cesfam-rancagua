import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { interpretarTexto, parsearPayloadBoton } from '@bh/shared';
import { z } from 'zod';
import { CifradoService } from '../cifrado/cifrado.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Config } from '../config';
import { CANAL, CONFIG, RELOJ } from '../tokens';
import { telefonoParaWhatsapp, type CanalMensajeria } from './canal';
import type { Reloj } from './procesador.service';
import { RespuestasService, type ResultadoRespuesta } from './respuestas.service';

/** Firma de Meta: `X-Hub-Signature-256: sha256=<HMAC-SHA256(cuerpo crudo, secreto de la app)>`. */
export function verificarFirma(
  cuerpoCrudo: Buffer | undefined,
  cabecera: string | undefined,
  secreto: string | undefined,
): boolean {
  if (!cuerpoCrudo || !cabecera || !secreto) return false;
  const esperada = Buffer.from(
    `sha256=${createHmac('sha256', secreto).update(cuerpoCrudo).digest('hex')}`,
  );
  const recibida = Buffer.from(cabecera);
  // Longitud distinta: timingSafeEqual lanzaría; se compara antes (la longitud no es secreta).
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

const estadoSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    errors: z
      .array(z.object({ code: z.union([z.number(), z.string()]).optional() }).passthrough())
      .optional(),
  })
  .passthrough();

const entranteSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    type: z.string(),
    button: z.object({ payload: z.string().optional() }).passthrough().optional(),
    text: z.object({ body: z.string().optional() }).passthrough().optional(),
    interactive: z
      .object({ button_reply: z.object({ id: z.string().optional() }).passthrough().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** Forma del cuerpo del webhook de WhatsApp (solo lo que usamos; el resto se ignora). */
export const webhookSchema = z
  .object({
    entry: z
      .array(
        z
          .object({
            changes: z
              .array(
                z
                  .object({
                    value: z
                      .object({
                        statuses: z.array(estadoSchema).optional(),
                        messages: z.array(entranteSchema).optional(),
                      })
                      .passthrough(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type PayloadWebhook = z.infer<typeof webhookSchema>;

type Entrante = z.infer<typeof entranteSchema>;
type Estado = z.infer<typeof estadoSchema>;
type ResultadoEntrante = ResultadoRespuesta | 'ambiguo' | 'telefono_distinto';

@Injectable()
export class WebhookService {
  private readonly log = new Logger(WebhookService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(RespuestasService) private readonly respuestas: RespuestasService,
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(CANAL) private readonly canal: CanalMensajeria,
  ) {}

  /** Procesa un cuerpo ya validado. Es idempotente: Meta reintenta entregas. */
  async procesar(payload: PayloadWebhook): Promise<{ estados: number; mensajes: number }> {
    let estados = 0;
    let mensajes = 0;
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const st of change.value.statuses ?? []) {
          await this.estado(st);
          estados++;
        }
        for (const msg of change.value.messages ?? []) {
          await this.entrante(msg);
          mensajes++;
        }
      }
    }
    return { estados, mensajes };
  }

  // ----------------------------------------------------------------------- estados de entrega

  private async estado(st: Estado): Promise<void> {
    const m = await this.prisma.mensaje.findUnique({ where: { proveedorId: st.id } });
    if (!m) return; // mensaje desconocido (o de otro sistema): se ignora
    const ahora = this.reloj.ahora();
    const abierto = m.estado === 'en_cola' || m.estado === 'enviado';

    switch (st.status) {
      case 'sent':
        if (!m.enviadoEn) {
          await this.prisma.mensaje.update({ where: { id: m.id }, data: { enviadoEn: ahora } });
        }
        break;
      case 'delivered':
        if (abierto) {
          await this.prisma.mensaje.update({
            where: { id: m.id },
            data: { estado: 'entregado', entregadoEn: m.entregadoEn ?? ahora },
          });
        }
        break;
      case 'read':
        // Los estados pueden llegar desordenados: «leído» no retrocede y no revive un fallido.
        if (m.estado !== 'fallido' && m.estado !== 'leido') {
          await this.prisma.mensaje.update({
            where: { id: m.id },
            data: { estado: 'leido', leidoEn: ahora, entregadoEn: m.entregadoEn ?? ahora },
          });
        }
        break;
      case 'failed':
        if (abierto) {
          const codigo = st.errors?.[0]?.code;
          await this.prisma.mensaje.update({
            where: { id: m.id },
            data: {
              estado: 'fallido',
              fallidoEn: ahora,
              errorCodigo: codigo !== undefined ? String(codigo) : 'DESCONOCIDO',
            },
          });
          // No llegó: la funcionaria debe llamar (nunca se cancela).
          if (m.tipo === 'confirmacion') {
            await this.prisma.tareaContacto.updateMany({
              where: { citaId: m.citaId, estado: 'enviado' },
              data: { estado: 'sin_respuesta' },
            });
          }
        }
        break;
      default:
        break; // deleted, warning, etc.
    }
  }

  // ---------------------------------------------------------------------- respuestas del paciente

  private async entrante(msg: Entrante): Promise<void> {
    if (await this.prisma.mensajeEntrante.findUnique({ where: { proveedorId: msg.id } })) return;

    // Todas las huellas posibles del número (la actual y las de claves anteriores, si hay rotación).
    const telefonoHash = this.cifrado.hashesBusqueda(`+${msg.from.replace(/\D/g, '')}`);
    let resultado: ResultadoEntrante = 'ignorado';
    let citaId: string | undefined;

    const payload = msg.button?.payload ?? msg.interactive?.button_reply?.id;
    const boton = payload ? parsearPayloadBoton(payload) : null;
    if (boton) {
      const m = await this.prisma.mensaje.findUnique({
        where: { id: boton.mensajeId },
        include: { paciente: { select: { telefonoHash: true } } },
      });
      if (m) {
        citaId = m.citaId;
        // Defensa en profundidad: la respuesta debe venir del teléfono al que se le escribió.
        if (m.paciente.telefonoHash && !telefonoHash.includes(m.paciente.telefonoHash)) {
          resultado = 'telefono_distinto';
        } else {
          resultado = await this.aplicar(
            boton.accion.toLowerCase() as 'si' | 'no' | 'baja',
            m.citaId,
            telefonoHash,
          );
        }
      }
    } else if (msg.type === 'text' && msg.text?.body) {
      const accion = interpretarTexto(msg.text.body);
      if (await this.responderPing(msg)) {
        // Diagnóstico de la demo: no toca ninguna cita; solo queda el registro.
      } else if (accion === 'baja') {
        resultado = await this.aplicar('baja', '', telefonoHash);
      } else if (accion) {
        // Texto libre: solo si ese teléfono tiene UNA cita esperando respuesta (si no, es ambiguo).
        const abiertas = await this.prisma.tareaContacto.findMany({
          where: { estado: 'enviado', cita: { paciente: { telefonoHash: { in: telefonoHash } } } },
          select: { citaId: true },
        });
        if (abiertas.length === 1) {
          citaId = abiertas[0]!.citaId;
          resultado = await this.aplicar(accion, citaId, telefonoHash);
        } else if (abiertas.length > 1) {
          resultado = 'ambiguo';
        }
      }
    }

    try {
      // Solo se guarda el resultado, nunca el texto del paciente.
      await this.prisma.mensajeEntrante.create({
        data: { proveedorId: msg.id, resultado, ...(citaId ? { citaId } : {}) },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    this.log.log(`respuesta de paciente: ${resultado}`);
  }

  /**
   * SOLO DEMO: si un celular del equipo (DEMO_TELEFONOS_PRUEBA) escribe «ping», responde «pong» en el
   * mismo WhatsApp para comprobar de punta a punta la conexión (webhook entrante y envío saliente).
   * No guarda el texto ni toca citas. En QA/PRODUCCION no hace nada.
   */
  private async responderPing(msg: Entrante): Promise<boolean> {
    if (this.config.ambiente !== 'DEMO') return false;
    if (msg.text?.body?.trim().toLowerCase() !== 'ping') return false;
    const telefono = `+${msg.from.replace(/\D/g, '')}`;
    if (!this.config.demoTelefonos.includes(telefono)) return false;
    try {
      await this.canal.enviarTexto({
        para: telefonoParaWhatsapp(telefono),
        texto: 'pong · BusinessHub Salud (demo): la conexión con WhatsApp funciona.',
      });
      this.log.log('ping de prueba respondido');
    } catch (e) {
      this.log.warn(`ping de prueba sin respuesta: ${e instanceof Error ? e.message : 'error'}`);
    }
    return true;
  }

  private async aplicar(
    accion: 'si' | 'no' | 'baja',
    citaId: string,
    telefonoHash: string[],
  ): Promise<ResultadoRespuesta> {
    if (accion === 'si') return this.respuestas.confirmar(citaId);
    if (accion === 'no') return this.respuestas.cancelar(citaId);
    return (await this.respuestas.registrarBaja(telefonoHash)) > 0 ? 'baja' : 'ignorado';
  }
}
