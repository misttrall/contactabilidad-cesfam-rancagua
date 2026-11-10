/**
 * La cola BullMQ contra un Redis REAL. Se omite si no hay TEST_REDIS_URL.
 *   Local: TEST_REDIS_URL=redis://localhost:6379 pnpm --filter @bh/api test
 * Usa un procesador falso (sin base de datos): aquí se prueba la mecánica de la cola.
 */
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ErrorCanal } from './canal';
import { ColaBullMQ, type ProcesadorDeMensajes, type ResultadoProceso } from './cola';

const URL_REDIS = process.env.TEST_REDIS_URL;

class ProcesadorFalso implements ProcesadorDeMensajes {
  readonly procesados: { id: string; t: number }[] = [];
  readonly fallidos: { id: string; codigo: string }[] = [];
  llamadasPorId = new Map<string, number>();
  comportamiento: (id: string, intento: number) => Promise<ResultadoProceso> | ResultadoProceso =
    () => ({ tipo: 'enviado' });

  async procesar(id: string): Promise<ResultadoProceso> {
    const intento = (this.llamadasPorId.get(id) ?? 0) + 1;
    this.llamadasPorId.set(id, intento);
    const r = await this.comportamiento(id, intento);
    if (r.tipo === 'enviado') this.procesados.push({ id, t: Date.now() });
    return r;
  }
  async marcarFallidoDefinitivo(id: string, codigo: string) {
    this.fallidos.push({ id, codigo });
  }
}

async function esperar(cond: () => boolean, ms = 8000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Tiempo agotado esperando la condición');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe.skipIf(!URL_REDIS)('Cola de envíos BullMQ (Redis real)', () => {
  const nombre = `test-${randomUUID()}`;
  const abiertas: ColaBullMQ[] = [];
  const crear = (
    p: ProcesadorFalso,
    o: { limite?: number; backoffMs?: number; nombre?: string } = {},
  ) => {
    const c = new ColaBullMQ({
      redisUrl: URL_REDIS!,
      procesador: p,
      limitePorSegundo: o.limite ?? 100,
      backoffMs: o.backoffMs ?? 40,
      nombre: o.nombre ?? nombre,
    });
    abiertas.push(c);
    return c;
  };

  afterEach(async () => {
    while (abiertas.length) await abiertas.pop()!.onModuleDestroy();
  });
  afterAll(async () => {
    const conexion = new IORedis(URL_REDIS!, { maxRetriesPerRequest: null });
    await new Queue(nombre, { connection: conexion }).obliterate({ force: true });
    conexion.disconnect();
  });

  it('procesa los mensajes encolados', async () => {
    const p = new ProcesadorFalso();
    const cola = crear(p);
    const ids = Array.from({ length: 5 }, () => randomUUID());
    await cola.encolar(ids);
    await esperar(() => p.procesados.length === 5);
    expect(new Set(p.procesados.map((x) => x.id))).toEqual(new Set(ids));
  });

  it('no duplica: encolar el mismo mensaje dos veces lo procesa una sola vez', async () => {
    const p = new ProcesadorFalso();
    const cola = crear(p);
    const id = randomUUID();
    await cola.encolar([id]);
    await cola.encolar([id]);
    await esperar(() => p.procesados.length >= 1);
    await new Promise((r) => setTimeout(r, 300));
    expect(p.llamadasPorId.get(id)).toBe(1);
  });

  it('un error transitorio se reintenta con espera y termina bien', async () => {
    const p = new ProcesadorFalso();
    p.comportamiento = (_id, intento) => {
      if (intento < 3) throw new ErrorCanal('límite de tasa', false, '130429');
      return { tipo: 'enviado' };
    };
    const cola = crear(p);
    const id = randomUUID();
    await cola.encolar([id]);
    await esperar(() => p.procesados.length === 1);
    expect(p.llamadasPorId.get(id)).toBe(3);
    expect(p.fallidos).toHaveLength(0);
  });

  it('agotados los 5 intentos se marca fallido definitivo UNA vez, con el código del error', async () => {
    const p = new ProcesadorFalso();
    p.comportamiento = () => {
      throw new ErrorCanal('caída', false, '503');
    };
    const cola = crear(p);
    const id = randomUUID();
    await cola.encolar([id]);
    await esperar(() => p.fallidos.length === 1);
    await new Promise((r) => setTimeout(r, 400));
    expect(p.llamadasPorId.get(id)).toBe(5);
    expect(p.fallidos).toEqual([{ id, codigo: '503' }]);
  });

  it('un mensaje diferido no sale antes de su hora', async () => {
    const p = new ProcesadorFalso();
    const cola = crear(p);
    const id = randomUUID();
    const t0 = Date.now();
    await cola.encolar([id], 600);
    await new Promise((r) => setTimeout(r, 250));
    expect(p.procesados).toHaveLength(0);
    await esperar(() => p.procesados.length === 1);
    expect(p.procesados[0]!.t - t0).toBeGreaterThanOrEqual(550);
  });

  it('si el procesador pide reprogramar (fuera de horario), el trabajo vuelve más tarde sin gastar reintentos', async () => {
    const p = new ProcesadorFalso();
    p.comportamiento = (_id, intento) =>
      intento === 1 ? { tipo: 'reprogramar', retrasoMs: 400 } : { tipo: 'enviado' };
    const cola = crear(p);
    const id = randomUUID();
    const t0 = Date.now();
    await cola.encolar([id]);
    await esperar(() => p.procesados.length === 1);
    expect(p.llamadasPorId.get(id)).toBe(2);
    expect(p.procesados[0]!.t - t0).toBeGreaterThanOrEqual(350);
    expect(p.fallidos).toHaveLength(0);
  });

  it('limita la tasa de envío (5 por segundo)', async () => {
    const p = new ProcesadorFalso();
    const cola = crear(p, { limite: 5 });
    const ids = Array.from({ length: 12 }, () => randomUUID());
    const t0 = Date.now();
    await cola.encolar(ids);
    await esperar(() => p.procesados.length === 12, 15_000);
    // Sin límite, 12 mensajes salen en pocos ms. Con 5/s deben repartirse en más de una ventana.
    // (El limitador de BullMQ no es una ventana deslizante exacta: se verifica que SÍ frena.)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
  }, 20_000);

  it('sobrevive a un reinicio: lo pendiente lo toma la instancia nueva', async () => {
    const nombreReinicio = `${nombre}-reinicio`;
    const p1 = new ProcesadorFalso();
    const c1 = crear(p1, { nombre: nombreReinicio });
    const id = randomUUID();
    await c1.encolar([id], 700); // diferido
    await c1.onModuleDestroy(); // "se cae" la instancia
    abiertas.splice(abiertas.indexOf(c1), 1);
    expect(p1.procesados).toHaveLength(0);

    const p2 = new ProcesadorFalso();
    crear(p2, { nombre: nombreReinicio });
    await esperar(() => p2.procesados.length === 1);
    expect(p2.procesados[0]!.id).toBe(id);

    const conexion = new IORedis(URL_REDIS!, { maxRetriesPerRequest: null });
    await new Queue(nombreReinicio, { connection: conexion }).obliterate({ force: true });
    conexion.disconnect();
  });
});

describe('entorno de pruebas de la cola', () => {
  // Evita que el CI "pase" omitiendo en silencio las pruebas contra Redis.
  it.runIf(Boolean(process.env.CI))(
    'en CI debe existir TEST_REDIS_URL (falta el servicio redis o declararla en turbo.json)',
    () => {
      expect(URL_REDIS).toBeTruthy();
    },
  );
});
