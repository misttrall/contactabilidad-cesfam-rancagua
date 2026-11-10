import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { esAdultoMayor, edadCumplida } from '@bh/shared';
import type { Config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { COLA_ENVIOS, CONFIG, RELOJ } from '../tokens';
import type { ColaEnvios } from './cola';
import { ParametrosService } from './parametros.service';
import type { Reloj } from './procesador.service';

const HORA_MS = 3_600_000;

/**
 * Revisión periódica de las citas «Enviadas» que esperan respuesta:
 *  1. pasadas `horas_espera_respuesta` sin respuesta -> «Sin respuesta» (a la lista de llamadas).
 *     NUNCA se cancela (RN-01);
 *  2. a mitad de la espera, los mayores de 65 reciben un segundo recordatorio (RN-12), una sola vez.
 * Es idempotente y segura con varias instancias: las transiciones son condicionales y el
 * recordatorio tiene unicidad (cita, tipo).
 */
@Injectable()
export class BarridoService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(BarridoService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(COLA_ENVIOS) private readonly cola: ColaEnvios,
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  onModuleInit() {
    if (this.config.barridoMs <= 0) return;
    this.timer = setInterval(() => {
      this.ejecutar().catch((e) => this.log.error(`Barrido fallido: ${(e as Error).message}`));
    }, this.config.barridoMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async ejecutar(): Promise<{ vencidas: number; recordatorios: number }> {
    const ahora = this.reloj.ahora();
    const horas = await this.parametros.leer('envio.horas_espera_respuesta');

    const vencidas = await this.prisma.tareaContacto.updateMany({
      where: { estado: 'enviado', enviadoEn: { lte: new Date(ahora.getTime() - horas * HORA_MS) } },
      data: { estado: 'sin_respuesta' },
    });

    let recordatorios = 0;
    if (await this.parametros.leer('envio.segundo_mensaje_adulto_mayor')) {
      const candidatas = await this.prisma.tareaContacto.findMany({
        where: {
          estado: 'enviado',
          enviadoEn: { lte: new Date(ahora.getTime() - (horas / 2) * HORA_MS) },
          cita: {
            mensajes: { none: { tipo: 'recordatorio' } },
            paciente: { fechaNacimiento: { not: null } },
          },
        },
        include: { cita: { include: { paciente: { select: { fechaNacimiento: true } } } } },
      });
      const ids: string[] = [];
      for (const t of candidatas) {
        const nac = t.cita.paciente.fechaNacimiento?.toISOString().slice(0, 10);
        const edad = nac ? edadCumplida(nac, t.cita.fecha.toISOString().slice(0, 10)) : null;
        if (edad === null || !esAdultoMayor(edad)) continue;
        try {
          const m = await this.prisma.mensaje.create({
            data: {
              citaId: t.citaId,
              pacienteId: t.cita.pacienteId,
              tipo: 'recordatorio',
              plantilla: 'recordatorio',
            },
          });
          ids.push(m.id);
        } catch (e) {
          // Otra instancia ya lo creó.
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        }
      }
      if (ids.length > 0) await this.cola.encolar(ids);
      recordatorios = ids.length;
    }
    return { vencidas: vencidas.count, recordatorios };
  }
}
