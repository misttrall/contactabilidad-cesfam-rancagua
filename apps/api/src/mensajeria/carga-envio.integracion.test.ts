/**
 * Prueba de carga del envío masivo (S6): 1.000 citas de un Cesfam en un solo envío, contra
 * PostgreSQL REAL con cola en memoria y canal simulado. Verifica:
 *  - todas quedan «enviadas», una sola vez (sin duplicados),
 *  - repetir el envío o pedirlo en paralelo no manda mensajes de más,
 *  - el listado de 1.000 filas y la creación del envío caben en un presupuesto de tiempo.
 * Los tiempos son holgados (para no fallar en CI lento) pero detectan regresiones groseras (N+1).
 * Se omite sin TEST_DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularDv } from '@bh/shared';
import { AppModule } from '../app.module';
import { configurarApp } from '../app';
import { CifradoService } from '../cifrado/cifrado.service';
import { PrismaService } from '../prisma/prisma.service';
import { crearEmisor } from '../pruebas/ayudas';
import { CANAL, COLA_ENVIOS, RELOJ, VERIFICADOR_TOKEN } from '../tokens';
import type { ColaEnMemoria } from './cola';
import type { SimuladorWhatsApp } from './simulador';

const URL_PRUEBAS = process.env.TEST_DATABASE_URL;
if (URL_PRUEBAS) process.env.DATABASE_URL = URL_PRUEBAS;

const TOTAL = 1000;
const FECHA = '2026-11-25';
const DENTRO = new Date('2026-11-20T15:00:00Z'); // 12:00 en Chile, dentro de la ventana horaria

describe.skipIf(!URL_PRUEBAS)('Carga: envío masivo de 1.000 confirmaciones', () => {
  const sufijo = randomUUID().slice(0, 6).toUpperCase();
  const CA = `LD${sufijo}`;
  const base = 7_000_000 + Math.floor(Math.random() * 100_000) * 10;
  let app: INestApplication;
  let prisma: PrismaService;
  let canal: SimuladorWhatsApp;
  let cola: ColaEnMemoria;
  let centroId: string;
  let auth: string;
  let citaIds: string[] = [];
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.LIMITE_TASA = 'on'; // este archivo SÍ prueba el límite de tasa
    const { verificador, emitir } = await crearEmisor();
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICADOR_TOKEN)
      .useValue(verificador)
      .overrideProvider(RELOJ)
      .useValue({ ahora: () => DENTRO })
      .compile();
    app = configurarApp(modulo.createNestApplication({ rawBody: true }));
    await app.init();
    prisma = app.get(PrismaService);
    canal = app.get(CANAL);
    cola = app.get(COLA_ENVIOS);
    const cifrado = app.get(CifradoService);
    auth = `Bearer ${await emitir({
      sub: randomUUID(),
      name: 'Funcionaria Carga',
      realm_access: { roles: ['funcionaria'] },
      centro_id: CA,
    })}`;

    centroId = (
      await prisma.centro.create({ data: { codigo: CA, nombre: `Centro Carga ${sufijo}` } })
    ).id;
    const cargaId = (
      await prisma.carga.create({
        data: {
          centroId,
          usuarioId: 'test',
          filasTotales: TOTAL,
          filasValidas: TOTAL,
          citasCreadas: TOTAL,
          citasExistentes: 0,
          morbilidadExcluida: 0,
          repetidasEnArchivo: 0,
          erroresTotal: 0,
          excluyoMorbilidad: true,
        },
      })
    ).id;

    const pacientes = Array.from({ length: TOTAL }, (_, i) => {
      const tel = `+569${30_000_000 + i}`;
      return {
        id: randomUUID(),
        rut: `${base + i}-${calcularDv(String(base + i))}`,
        nombre: `Paciente Carga ${i}`,
        telefonoCifrado: cifrado.cifrar(tel),
        telefonoHash: cifrado.hashBusqueda(tel),
        // un tercio son adultos mayores (se les prioriza)
        fechaNacimiento: new Date(i % 3 === 0 ? '1950-01-01T00:00:00Z' : '1985-01-01T00:00:00Z'),
      };
    });
    await prisma.paciente.createMany({ data: pacientes });
    const citas = pacientes.map((p, i) => ({
      id: randomUUID(),
      centroId,
      pacienteId: p.id,
      profesionalNombre: 'Dra. Carga',
      profesionalClave: 'dra carga',
      fecha: new Date(`${FECHA}T00:00:00Z`),
      hora: `${String(8 + (i % 9)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
      prestacion: 'Control',
      tipo: 'cronico' as const,
      cargaId,
    }));
    await prisma.cita.createMany({ data: citas });
    await prisma.tareaContacto.createMany({
      data: citas.map((c) => ({ citaId: c.id, estado: 'sin_enviar' as const })),
    });
    citaIds = citas.map((c) => c.id);
  }, 60_000);

  afterAll(async () => {
    await prisma.envio.deleteMany({ where: { centroId } });
    await prisma.cita.deleteMany({ where: { centroId } });
    await prisma.paciente.deleteMany({ where: { nombre: { startsWith: 'Paciente Carga' } } });
    await prisma.carga.deleteMany({ where: { centroId } });
    await prisma.centro.deleteMany({ where: { id: centroId } });
    await app.close();
  }, 60_000);

  it('lista 1.000 citas del día en un tiempo razonable', async () => {
    const t0 = Date.now();
    const res = await http()
      .get(`/api/confirmaciones?fecha=${FECHA}`)
      .set('Authorization', auth)
      .expect(200);
    const ms = Date.now() - t0;
    expect(res.body.filas.length).toBeGreaterThanOrEqual(TOTAL);
    expect(ms).toBeLessThan(5_000);
  });

  it('envía las 1.000 de una vez: todas «enviadas», una sola vez cada una', async () => {
    const t0 = Date.now();
    const res = await http()
      .post('/api/envios')
      .set('Authorization', auth)
      .send({ citaIds })
      .expect(201);
    const msCrear = Date.now() - t0;
    expect(res.body.encoladas).toBe(TOTAL);
    expect(msCrear).toBeLessThan(10_000); // encolar no espera a WhatsApp

    const t1 = Date.now();
    await cola.drenar();
    const msDrenar = Date.now() - t1;
    expect(msDrenar).toBeLessThan(30_000);

    expect(canal.enviados).toHaveLength(TOTAL);
    const destinos = new Set(canal.enviados.map((e) => e.para));
    expect(destinos.size).toBe(TOTAL); // ningún paciente recibió dos mensajes
    expect(await prisma.mensaje.count({ where: { cita: { centroId } } })).toBe(TOTAL);
    expect(
      await prisma.tareaContacto.count({ where: { cita: { centroId }, estado: 'enviado' } }),
    ).toBe(TOTAL);
    expect(
      await prisma.mensaje.count({ where: { cita: { centroId }, estado: { not: 'enviado' } } }),
    ).toBe(0);
  }, 60_000);

  it('repetir el envío (o dos funcionarias a la vez) no manda mensajes de más', async () => {
    const antes = canal.enviados.length;
    const [a, b] = await Promise.all([
      http().post('/api/envios').set('Authorization', auth).send({ citaIds }),
      http().post('/api/envios').set('Authorization', auth).send({ citaIds }),
    ]);
    await cola.drenar();
    expect([a.status, b.status].every((s) => s === 201 || s === 400 || s === 409)).toBe(true);
    for (const r of [a, b]) if (r.status === 201) expect(r.body.encoladas).toBe(0);
    expect(canal.enviados.length).toBe(antes);
    expect(await prisma.mensaje.count({ where: { cita: { centroId } } })).toBe(TOTAL);
  }, 60_000);

  it('el límite de tasa de la API frena una ráfaga de creación de envíos', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 30 }, () =>
        http()
          .post('/api/envios/previsualizar')
          .set('Authorization', auth)
          .send({ citaIds: [citaIds[0]] }),
      ),
    );
    // /previsualizar no es el endpoint limitado; el límite aplica a /api/envios (POST) 20/min.
    expect(respuestas.every((r) => r.status !== 429)).toBe(true);
    const ráfaga = [];
    for (let i = 0; i < 25; i++) {
      ráfaga.push(
        await http()
          .post('/api/envios')
          .set('Authorization', auth)
          .send({ citaIds: [citaIds[0]] }),
      );
    }
    expect(ráfaga.some((r) => r.status === 429)).toBe(true);
  }, 60_000);
});
