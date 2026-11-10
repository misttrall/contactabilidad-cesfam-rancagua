import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { payloadBoton } from '@bh/shared';
import { CifradoService } from '../cifrado/cifrado.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService, type PayloadWebhook } from './webhook.service';

/**
 * SOLO DEMO (modo simulador, fuera de producción): reproduce lo que haría WhatsApp. Genera un
 * cuerpo con el MISMO formato que el webhook real y lo procesa por el mismo código, así la demo
 * ejercita la lógica verdadera (no un atajo).
 *
 * Reparto determinista por mensaje: 60 % «Sí», 15 % «No», 5 % pide la baja, 10 % lo lee y no
 * contesta, 10 % no llega a entregarse.
 */
@Injectable()
export class SimulacionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(WebhookService) private readonly webhook: WebhookService,
  ) {}

  async simular(centroId: string) {
    const mensajes = await this.prisma.mensaje.findMany({
      where: {
        tipo: { in: ['confirmacion', 'recordatorio'] },
        estado: 'enviado',
        proveedorId: { not: null },
        cita: { centroId, tarea: { estado: 'enviado' } },
      },
      include: { paciente: { select: { telefonoCifrado: true } } },
      take: 2000,
    });

    const statuses: unknown[] = [];
    const messages: unknown[] = [];
    const r = { confirmadas: 0, canceladas: 0, bajas: 0, sinResponder: 0, sinEntregar: 0 };

    for (const m of mensajes) {
      const cubo = parseInt(createHash('sha256').update(m.id).digest('hex').slice(0, 6), 16) % 100;
      if (cubo >= 90) {
        r.sinEntregar++;
        continue;
      }
      statuses.push(
        { id: m.proveedorId, status: 'delivered' },
        { id: m.proveedorId, status: 'read' },
      );
      if (cubo >= 80) {
        r.sinResponder++;
        continue;
      }
      const from = m.paciente.telefonoCifrado
        ? this.cifrado.descifrar(m.paciente.telefonoCifrado).replace(/\D/g, '')
        : '56900000000';
      const accion = cubo < 60 ? 'SI' : cubo < 75 ? 'NO' : 'BAJA';
      if (accion === 'SI') r.confirmadas++;
      else if (accion === 'NO') r.canceladas++;
      else r.bajas++;
      messages.push({
        id: `wamid.SIMIN.${randomUUID()}`,
        from,
        type: 'button',
        button: { payload: payloadBoton(accion, m.id), text: accion },
      });
    }

    const payload: PayloadWebhook = {
      entry: [{ changes: [{ value: { statuses, messages } as never }] }],
    };
    await this.webhook.procesar(payload);
    return r;
  }
}
