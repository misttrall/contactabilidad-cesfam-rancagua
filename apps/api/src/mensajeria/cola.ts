import type { OnModuleDestroy } from '@nestjs/common';
import { DelayedError, Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { ErrorCanal } from './canal';

export type ResultadoProceso =
  | { tipo: 'enviado' }
  | { tipo: 'omitido'; motivo: string }
  | { tipo: 'fallido'; codigo: string }
  /** Fuera del horario permitido: volver a intentar en `retrasoMs`. */
  | { tipo: 'reprogramar'; retrasoMs: number };

/** Lo que la cola necesita del procesador (lo implementa ProcesadorEnvio). */
export interface ProcesadorDeMensajes {
  procesar(mensajeId: string): Promise<ResultadoProceso>;
  marcarFallidoDefinitivo(mensajeId: string, codigo: string): Promise<void>;
}

export interface ColaEnvios {
  encolar(mensajeIds: string[], retrasoMs?: number): Promise<void>;
}

const INTENTOS = 5;

// ---------------------------------------------------------------------------------- en memoria

/**
 * Cola en memoria: solo desarrollo y pruebas (no sobrevive a un reinicio ni comparte entre
 * instancias). Procesa de inmediato y emula los reintentos; lo diferido queda en `pendientes`.
 */
export class ColaEnMemoria implements ColaEnvios {
  readonly pendientes: { mensajeId: string; retrasoMs: number }[] = [];
  private readonly enCurso = new Set<Promise<void>>();

  constructor(
    private readonly procesador: ProcesadorDeMensajes,
    private readonly intentos = 3,
  ) {}

  async encolar(mensajeIds: string[], retrasoMs = 0): Promise<void> {
    for (const mensajeId of mensajeIds) {
      if (retrasoMs > 0) this.pendientes.push({ mensajeId, retrasoMs });
      else this.lanzar(mensajeId);
    }
  }

  private lanzar(mensajeId: string) {
    const p = this.ejecutar(mensajeId).finally(() => this.enCurso.delete(p));
    this.enCurso.add(p);
  }

  private async ejecutar(mensajeId: string): Promise<void> {
    for (let i = 1; i <= this.intentos; i++) {
      try {
        const r = await this.procesador.procesar(mensajeId);
        if (r.tipo === 'reprogramar') this.pendientes.push({ mensajeId, retrasoMs: r.retrasoMs });
        return;
      } catch (e) {
        if (i === this.intentos) {
          await this.procesador
            .marcarFallidoDefinitivo(mensajeId, e instanceof ErrorCanal ? e.codigo : 'ERROR')
            .catch(() => undefined);
        }
      }
    }
  }

  /** Espera a que termine todo lo que está en curso. */
  async drenar(): Promise<void> {
    while (this.enCurso.size > 0) await Promise.all([...this.enCurso]);
  }

  /** Para pruebas: ejecuta lo que estaba diferido, como si ya llegara su hora. */
  async liberarPendientes(): Promise<void> {
    const lote = this.pendientes.splice(0);
    for (const p of lote) this.lanzar(p.mensajeId);
    await this.drenar();
  }
}

// ------------------------------------------------------------------------------------- BullMQ

export interface OpcionesColaBullMQ {
  redisUrl: string;
  procesador: ProcesadorDeMensajes;
  /** Mensajes por segundo hacia WhatsApp. */
  limitePorSegundo: number;
  nombre?: string;
  /** Espera base del reintento exponencial (ms). */
  backoffMs?: number;
  concurrencia?: number;
}

/**
 * Cola persistente en Redis (BullMQ): sobrevive a reinicios, reintenta con espera exponencial,
 * limita la tasa de envío y soporta mensajes diferidos (fuera de horario).
 */
export class ColaBullMQ implements ColaEnvios, OnModuleDestroy {
  private readonly conexion: IORedis;
  private readonly cola: Queue;
  private readonly worker: Worker;
  private readonly backoffMs: number;

  constructor(private readonly o: OpcionesColaBullMQ) {
    const nombre = o.nombre ?? 'envios-whatsapp';
    this.backoffMs = o.backoffMs ?? 30_000;
    // BullMQ exige maxRetriesPerRequest = null en la conexión del worker.
    this.conexion = new IORedis(o.redisUrl, { maxRetriesPerRequest: null });
    this.cola = new Queue(nombre, { connection: this.conexion });
    this.worker = new Worker(nombre, (job, token) => this.procesar(job, token), {
      connection: this.conexion,
      concurrency: o.concurrencia ?? 5,
      limiter: { max: o.limitePorSegundo, duration: 1000 },
    });
    this.worker.on('failed', (job, err) => {
      if (!job) return;
      const agotados =
        err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
      if (agotados) {
        void o.procesador
          .marcarFallidoDefinitivo(
            job.data.mensajeId,
            err instanceof ErrorCanal ? err.codigo : 'ERROR',
          )
          .catch(() => undefined);
      }
    });
    // Un error de Redis no debe tumbar el proceso.
    this.worker.on('error', () => undefined);
    this.cola.on('error', () => undefined);
  }

  private async procesar(job: Job<{ mensajeId: string }>, token?: string): Promise<string> {
    const r = await this.o.procesador.procesar(job.data.mensajeId);
    if (r.tipo === 'reprogramar') {
      await job.moveToDelayed(Date.now() + r.retrasoMs, token);
      throw new DelayedError();
    }
    return r.tipo;
  }

  async encolar(mensajeIds: string[], retrasoMs = 0): Promise<void> {
    if (mensajeIds.length === 0) return;
    await this.cola.addBulk(
      mensajeIds.map((mensajeId) => ({
        name: 'enviar',
        data: { mensajeId },
        opts: {
          // El id del trabajo es el del mensaje: no puede haber dos trabajos para el mismo mensaje.
          jobId: mensajeId,
          delay: retrasoMs,
          attempts: INTENTOS,
          backoff: { type: 'exponential', delay: this.backoffMs },
          removeOnComplete: { age: 86_400 },
          removeOnFail: { age: 7 * 86_400 },
        },
      })),
    );
  }

  /** Cuántos trabajos hay en cada estado (para pruebas y monitoreo). */
  contar() {
    return this.cola.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.cola.close();
    this.conexion.disconnect();
  }
}
