/**
 * Pruebas de integración contra PostgreSQL REAL. Se omiten si no hay TEST_DATABASE_URL.
 *   Local:  TEST_DATABASE_URL=postgresql://businesshub:businesshub@localhost:5432/businesshub_test pnpm --filter @bh/api test
 *   CI:     el workflow levanta un servicio postgres, aplica las migraciones y define la variable.
 * Cada ejecución usa centros con código único y limpia lo que crea (la auditoría es append-only y queda).
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
import { VERIFICADOR_TOKEN } from '../tokens';
import { construirXlsx } from './excel';

const URL_PRUEBAS = process.env.TEST_DATABASE_URL;
if (URL_PRUEBAS) process.env.DATABASE_URL = URL_PRUEBAS;

const ENC = ['Paciente', 'RUT', 'Teléfono', 'Fecha', 'Hora', 'Profesional', 'Prestación', 'Tipo'];
const rutDe = (n: number) => `${n}-${calcularDv(String(n))}`;

describe.skipIf(!URL_PRUEBAS)('Importación de planillas (PostgreSQL real)', () => {
  const sufijo = randomUUID().slice(0, 6).toUpperCase();
  const CENTRO_A = `TA${sufijo}`;
  const CENTRO_B = `TB${sufijo}`;
  const base = 3_000_000 + Math.floor(Math.random() * 500_000) * 10; // RUT de prueba únicos por ejecución
  let app: INestApplication;
  let prisma: PrismaService;
  let cifrado: CifradoService;
  let emitir: Awaited<ReturnType<typeof crearEmisor>>['emitir'];
  let centroA: { id: string };
  let centroB: { id: string };
  const http = () => request(app.getHttpServer());

  const sub = randomUUID();
  const funcionariaA = () =>
    emitir({
      sub,
      name: 'Funcionaria Test',
      realm_access: { roles: ['funcionaria'] },
      centro_id: CENTRO_A,
    });
  const encargado = () =>
    emitir({ sub: randomUUID(), name: 'Encargado Test', realm_access: { roles: ['encargado'] } });

  const fila = (i: number, extra: Partial<Record<string, unknown>> = {}) => {
    const v: Record<string, unknown> = {
      Paciente: `Paciente Prueba ${i}`,
      RUT: rutDe(base + i),
      Teléfono: `9${String(10_000_000 + i)}`,
      Fecha: '20-11-2026',
      Hora: `${String(8 + (i % 8)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
      Profesional: 'dra. DEMO uno', // distinto formato que el catálogo: debe enlazar igual
      Prestación: 'Control crónico',
      Tipo: 'Crónico',
      ...extra,
    };
    return ENC.map((h) => v[h]);
  };
  const planilla = (filas: unknown[][]) => construirXlsx([ENC, ...filas]);
  const importar = (token: string, filas: unknown[][], campos: Record<string, string> = {}) => {
    let r = http().post('/api/cargas').set('Authorization', `Bearer ${token}`);
    for (const [k, v] of Object.entries(campos)) r = r.field(k, v);
    return r.attach('archivo', planilla(filas), 'planilla.xlsx');
  };
  const contarCitas = (centroId: string) => prisma.cita.count({ where: { centroId } });

  beforeAll(async () => {
    const { verificador, emitir: e } = await crearEmisor();
    emitir = e;
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICADOR_TOKEN)
      .useValue(verificador)
      .compile();
    app = configurarApp(modulo.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    cifrado = app.get(CifradoService);
    centroA = await prisma.centro.create({
      data: { codigo: CENTRO_A, nombre: `Centro A ${sufijo}` },
    });
    centroB = await prisma.centro.create({
      data: { codigo: CENTRO_B, nombre: `Centro B ${sufijo}` },
    });
    await prisma.profesional.create({ data: { nombre: 'Dra. Demo Uno', centroId: centroA.id } });
  });

  afterAll(async () => {
    const centros = { in: [centroA?.id, centroB?.id].filter(Boolean) as string[] };
    await prisma.cita.deleteMany({ where: { centroId: centros } }); // tarea_contacto cae en cascada
    await prisma.carga.deleteMany({ where: { centroId: centros } });
    await prisma.paciente.deleteMany({
      where: { rut: { in: Array.from({ length: 1400 }, (_, i) => rutDe(base + i)) } },
    });
    await prisma.profesional.deleteMany({ where: { centroId: centros } });
    await prisma.centro.deleteMany({ where: { id: centros } });
    await app.close();
  });

  it('importa citas con su tarea "sin_enviar", enlaza al profesional y excluye la morbilidad', async () => {
    const res = await importar(await funcionariaA(), [
      fila(1),
      fila(2),
      fila(3),
      fila(4),
      fila(5, { Tipo: 'Morbilidad' }),
    ]).expect(201);
    expect(res.body).toMatchObject({
      citasCreadas: 4,
      citasExistentes: 0,
      pacientesNuevos: 4,
      morbilidadExcluida: 1,
    });

    expect(await contarCitas(centroA.id)).toBe(4);
    const tareas = await prisma.tareaContacto.findMany({
      where: { cita: { centroId: centroA.id } },
    });
    expect(tareas).toHaveLength(4);
    expect(tareas.every((t) => t.estado === 'sin_enviar' && t.subestado === null)).toBe(true);

    const enlazadas = await prisma.cita.count({
      where: { centroId: centroA.id, profesionalId: { not: null } },
    });
    expect(enlazadas).toBe(4); // "dra. DEMO uno" == "Dra. Demo Uno" sin importar tildes/mayúsculas
  });

  it('guarda el teléfono cifrado (no en claro) y se puede descifrar', async () => {
    const p = await prisma.paciente.findUniqueOrThrow({ where: { rut: rutDe(base + 1) } });
    expect(p.telefonoCifrado).toBeTruthy();
    expect(p.telefonoCifrado).not.toContain('10000001');
    expect(cifrado.descifrar(p.telefonoCifrado!)).toBe('+56910000001');
  });

  it('registra la carga y la auditoría sin RUT, nombres ni teléfonos', async () => {
    const carga = await prisma.carga.findFirstOrThrow({
      where: { centroId: centroA.id },
      orderBy: { creadaEn: 'desc' },
    });
    expect(carga).toMatchObject({
      citasCreadas: 4,
      filasTotales: 5,
      morbilidadExcluida: 1,
      usuarioId: sub,
    });
    const ev = await prisma.auditEvent.findFirstOrThrow({
      where: { accion: 'carga.importar', recursoId: carga.id },
    });
    const texto = JSON.stringify(ev, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(texto).not.toContain(String(base + 1));
    expect(texto).not.toContain('Paciente Prueba');
    expect(texto).not.toContain('10000001');
  });

  it('es idempotente: recargar la misma planilla no duplica citas ni reinicia el estado de contacto', async () => {
    const cita = await prisma.cita.findFirstOrThrow({ where: { centroId: centroA.id } });
    await prisma.tareaContacto.update({
      where: { citaId: cita.id },
      data: { estado: 'confirmado' },
    });

    const res = await importar(await funcionariaA(), [fila(1), fila(2), fila(3), fila(4)]).expect(
      201,
    );
    expect(res.body).toMatchObject({ citasCreadas: 0, citasExistentes: 4, pacientesNuevos: 0 });
    expect(await contarCitas(centroA.id)).toBe(4);
    const tarea = await prisma.tareaContacto.findUniqueOrThrow({ where: { citaId: cita.id } });
    expect(tarea.estado).toBe('confirmado');
  });

  it('la validación previa informa cuántas citas ya estaban cargadas', async () => {
    const res = await http()
      .post('/api/cargas/validar')
      .set('Authorization', `Bearer ${await funcionariaA()}`)
      .attach('archivo', planilla([fila(1), fila(2), fila(6)]), 'p.xlsx')
      .expect(201);
    expect(res.body).toMatchObject({ validas: 3, citasYaCargadas: 2, citasNuevas: 1 });
    expect(await contarCitas(centroA.id)).toBe(4); // validar no escribe
  });

  it('actualiza el teléfono del paciente si cambió en AVIS', async () => {
    const res = await importar(await funcionariaA(), [
      fila(1, { Teléfono: '+56 9 7777 1111' }),
    ]).expect(201);
    expect(res.body.pacientesActualizados).toBe(1);
    const p = await prisma.paciente.findUniqueOrThrow({ where: { rut: rutDe(base + 1) } });
    expect(cifrado.descifrar(p.telefonoCifrado!)).toBe('+56977771111');
  });

  it('importa las filas válidas y reporta las erróneas', async () => {
    const res = await importar(await funcionariaA(), [
      fila(10),
      fila(11, { RUT: '1-9' }),
      fila(12),
    ]).expect(201);
    expect(res.body).toMatchObject({ citasCreadas: 2, erroresTotal: 1 });
  });

  it('sin filas válidas responde 400 y no crea ninguna carga', async () => {
    const antes = await prisma.carga.count({ where: { centroId: centroA.id } });
    await importar(await funcionariaA(), [fila(20, { RUT: 'mal' })]).expect(400);
    expect(await prisma.carga.count({ where: { centroId: centroA.id } })).toBe(antes);
  });

  it('funcionaria no puede importar en otro centro y no se escribe nada', async () => {
    await importar(await funcionariaA(), [fila(30)], { centro: CENTRO_B }).expect(403);
    expect(await contarCitas(centroB.id)).toBe(0);
  });

  it('encargado importa indicando el centro; el mismo paciente puede tener citas en varios centros', async () => {
    await importar(await encargado(), [fila(1)], { centro: CENTRO_B }).expect(201);
    expect(await contarCitas(centroB.id)).toBe(1);
    expect(await prisma.paciente.count({ where: { rut: rutDe(base + 1) } })).toBe(1); // un solo paciente
  });

  it('el historial de la funcionaria solo muestra las cargas de su centro', async () => {
    const res = await http()
      .get('/api/cargas')
      .set('Authorization', `Bearer ${await funcionariaA()}`)
      .expect(200);
    expect(res.body.opciones.excluirMorbilidadPorDefecto).toBe(true);
    expect(res.body.historial.length).toBeGreaterThan(0);
    expect(
      res.body.historial.every((h: { centro: { codigo: string } }) => h.centro.codigo === CENTRO_A),
    ).toBe(true);
  });

  it('dos importaciones simultáneas de la misma planilla no duplican citas (bloqueo por centro)', async () => {
    const filas = Array.from({ length: 60 }, (_, i) => fila(100 + i));
    const token = await funcionariaA();
    const [a, b] = await Promise.all([importar(token, filas), importar(token, filas)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.citasCreadas + b.body.citasCreadas).toBe(60);
    const nuevas = await prisma.cita.count({
      where: { centroId: centroA.id, paciente: { rut: { in: filas.map((f) => String(f[1])) } } },
    });
    expect(nuevas).toBe(60);
  });

  it('importa 1.000 filas en un tiempo razonable', async () => {
    const filas = Array.from({ length: 1000 }, (_, i) =>
      fila(200 + i, {
        Hora: `${String(8 + (i % 10)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
      }),
    );
    const t0 = Date.now();
    const res = await importar(await funcionariaA(), filas).expect(201);
    expect(res.body.citasCreadas + res.body.repetidasEnArchivo).toBe(1000);
    expect(Date.now() - t0).toBeLessThan(20_000);
  }, 60_000);

  describe('fachada FHIR sobre lo importado', () => {
    const F = '25-11-2026';
    let citaDeB: { id: string };
    let pacienteSoloDeB: { id: string };

    beforeAll(async () => {
      await importar(await funcionariaA(), [
        fila(400, { Fecha: F }),
        fila(401, { Fecha: F }),
        fila(402, { Fecha: F }),
      ]).expect(201);
      await importar(await encargado(), [fila(1300, { Fecha: F })], { centro: CENTRO_B }).expect(
        201,
      );
      citaDeB = await prisma.cita.findFirstOrThrow({
        where: { centroId: centroB.id, paciente: { rut: rutDe(base + 1300) } },
      });
      pacienteSoloDeB = await prisma.paciente.findUniqueOrThrow({
        where: { rut: rutDe(base + 1300) },
      });
    });

    it('Appointment?date= devuelve las citas del centro con el offset real de Chile y estado booked', async () => {
      const res = await http()
        .get('/fhir/R4/Appointment?date=2026-11-25')
        .set('Authorization', `Bearer ${await funcionariaA()}`)
        .expect(200);
      expect(res.headers['content-type']).toContain('application/fhir+json');
      expect(res.body.total).toBe(3);
      for (const { resource: a } of res.body.entry) {
        expect(a.status).toBe('booked');
        expect(a.start).toMatch(/^2026-11-25T\d\d:\d\d:00-03:00$/);
        expect(
          a.participant.map(
            (p: { actor: { reference?: string } }) => p.actor.reference?.split('/')[0],
          ),
        ).toEqual(expect.arrayContaining(['Patient', 'Location', 'Practitioner']));
      }
    });

    it('exige el parámetro date', async () => {
      const res = await http()
        .get('/fhir/R4/Appointment')
        .set('Authorization', `Bearer ${await funcionariaA()}`)
        .expect(400);
      expect(res.body.resourceType).toBe('OperationOutcome');
    });

    it('la funcionaria no ve las citas de otro centro ni pidiéndolas por location', async () => {
      const res = await http()
        .get(`/fhir/R4/Appointment?date=2026-11-25&location=${centroB.id}`)
        .set('Authorization', `Bearer ${await funcionariaA()}`)
        .expect(200);
      expect(res.body.total).toBe(0);
      await http()
        .get(`/fhir/R4/Appointment/${citaDeB.id}`)
        .set('Authorization', `Bearer ${await funcionariaA()}`)
        .expect(404);
    });

    it('el encargado ve las citas de ambos centros', async () => {
      const res = await http()
        .get('/fhir/R4/Appointment?date=2026-11-25')
        .set('Authorization', `Bearer ${await encargado()}`)
        .expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(4);
    });

    it('Patient por RUN: devuelve teléfono descifrado y deja rastro en la auditoría sin datos personales', async () => {
      const antes = await prisma.auditEvent.count({ where: { accion: 'paciente.leer' } });
      const res = await http()
        .get(`/fhir/R4/Patient?identifier=https://hl7chile.cl/fhir/sid/run|${rutDe(base + 400)}`)
        .set('Authorization', `Bearer ${await funcionariaA()}`)
        .expect(200);
      expect(res.body.total).toBe(1);
      const p = res.body.entry[0].resource;
      expect(p.telecom[0].value).toBe(`+569${String(10_000_000 + 400)}`);
      expect(p.identifier[0].value).toBe(rutDe(base + 400));

      const ev = await prisma.auditEvent.findMany({
        where: { accion: 'paciente.leer' },
        orderBy: { id: 'desc' },
        take: 1,
      });
      expect(await prisma.auditEvent.count({ where: { accion: 'paciente.leer' } })).toBe(antes + 1);
      const texto = JSON.stringify(ev, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      expect(texto).not.toContain(String(base + 400));
      expect(texto).not.toContain('Paciente Prueba');
    });

    it('un paciente que solo tiene citas en otro centro no es visible (404 / bundle vacío)', async () => {
      const h = `Bearer ${await funcionariaA()}`;
      await http()
        .get(`/fhir/R4/Patient/${pacienteSoloDeB.id}`)
        .set('Authorization', h)
        .expect(404);
      const res = await http()
        .get(`/fhir/R4/Patient?identifier=${rutDe(base + 1300)}`)
        .set('Authorization', h)
        .expect(200);
      expect(res.body.total).toBe(0);
    });

    it('identifier con RUN inválido: 400 con OperationOutcome', async () => {
      const res = await http()
        .get('/fhir/R4/Patient?identifier=1000001-9')
        .set('Authorization', `Bearer ${await funcionariaA()}`)
        .expect(400);
      expect(res.body.issue[0].code).toBe('invalid');
    });

    it('ids que no son UUID responden 404, no 500', async () => {
      await http()
        .get('/fhir/R4/Patient/no-es-uuid')
        .set('Authorization', `Bearer ${await funcionariaA()}`)
        .expect(404);
      await http()
        .get('/fhir/R4/Appointment/123')
        .set('Authorization', `Bearer ${await funcionariaA()}`)
        .expect(404);
    });
  });
});

describe('entorno de pruebas de integración', () => {
  // Evita que el CI "pase" omitiendo en silencio las pruebas contra PostgreSQL.
  it.runIf(Boolean(process.env.CI))(
    'en CI debe existir TEST_DATABASE_URL (si falla, falta el servicio postgres o declarar la variable en turbo.json)',
    () => {
      expect(URL_PRUEBAS).toBeTruthy();
    },
  );
});
