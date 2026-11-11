/**
 * Retención, anonimización y derechos ARCO+ contra PostgreSQL REAL. Se omite sin TEST_DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { configurarApp } from '../app';
import { CifradoService } from '../cifrado/cifrado.service';
import { PrismaService } from '../prisma/prisma.service';
import { crearEmisor } from '../pruebas/ayudas';
import { VERIFICADOR_TOKEN } from '../tokens';
import { PREFIJO_ANON, restarMeses } from './privacidad.service';

const URL_PRUEBAS = process.env.TEST_DATABASE_URL;
if (URL_PRUEBAS) process.env.DATABASE_URL = URL_PRUEBAS;

describe('restarMeses', () => {
  it('resta meses calendario y acota al último día del mes', () => {
    expect(restarMeses(new Date('2026-11-10T12:00:00Z'), 12).toISOString().slice(0, 10)).toBe(
      '2025-11-10',
    );
    expect(restarMeses(new Date('2026-03-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe(
      '2026-02-28',
    );
    expect(restarMeses(new Date('2026-01-15T00:00:00Z'), 2).toISOString().slice(0, 10)).toBe(
      '2025-11-15',
    );
  });
});

describe.skipIf(!URL_PRUEBAS)('Privacidad (PostgreSQL real)', () => {
  const sufijo = randomUUID().slice(0, 6).toUpperCase();
  const subAdmin = randomUUID();
  let app: INestApplication;
  let prisma: PrismaService;
  let cifrado: CifradoService;
  let emitir: Awaited<ReturnType<typeof crearEmisor>>['emitir'];
  let centroId: string;
  let cargaId: string;
  const http = () => request(app.getHttpServer());
  const tok = async (c: Record<string, unknown>) => `Bearer ${await emitir({ name: 'U', ...c })}`;
  const admin = () => tok({ sub: subAdmin, realm_access: { roles: ['administrador'] } });
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);
  let n = 0;

  /** Crea un paciente con una cita, una llamada saliente y una entrante; `diasCita` define su antigüedad. */
  async function crearPaciente(diasCita: number, creadoHaceDias = diasCita + 5) {
    n += 1;
    const rut = `9${sufijo.slice(0, 3).replace(/\D/g, '1')}${String(n).padStart(4, '0')}-${n % 10}`;
    const p = await prisma.paciente.create({
      data: {
        rut: `${rut}-${randomUUID().slice(0, 4)}`,
        nombre: `Paciente Prueba ${n}`,
        telefonoCifrado: cifrado.cifrar('+56912345678'),
        telefonoHash: cifrado.hashBusqueda('+56912345678'),
        fechaNacimiento: new Date('1950-06-15T00:00:00Z'),
        sexo: 'F',
        creadoEn: hace(creadoHaceDias),
      },
    });
    const fecha = hace(diasCita);
    const cita = await prisma.cita.create({
      data: {
        centroId,
        pacienteId: p.id,
        profesionalNombre: 'Prof Prueba',
        profesionalClave: `prof-${n}`,
        fecha: new Date(`${fecha.toISOString().slice(0, 10)}T00:00:00.000Z`),
        hora: '09:00',
        prestacion: 'Control',
        tipo: 'cronico',
        cargaId,
        tarea: { create: { estado: 'confirmado' } },
      },
    });
    await prisma.llamadaSaliente.create({
      data: {
        citaId: cita.id,
        resultado: 'confirmado',
        observacion: 'dato libre',
        usuarioId: 'u',
        creadaEn: fecha,
      },
    });
    const motivo = await prisma.motivoLlamada.findFirstOrThrow();
    await prisma.llamadaEntrante.create({
      data: {
        centroId,
        pacienteId: p.id,
        rut: p.rut,
        motivoId: motivo.id,
        observacion: 'obs libre',
        usuarioId: 'u',
        creadaEn: fecha,
      },
    });
    return p;
  }

  beforeAll(async () => {
    const { verificador, emitir: e } = await crearEmisor();
    emitir = e;
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICADOR_TOKEN)
      .useValue(verificador)
      .compile();
    app = configurarApp(modulo.createNestApplication({ rawBody: true }));
    await app.init();
    prisma = app.get(PrismaService);
    cifrado = app.get(CifradoService);
    const centro = await prisma.centro.create({
      data: { codigo: `PV${sufijo}`, nombre: `Centro Priv ${sufijo}` },
    });
    centroId = centro.id;
    cargaId = (
      await prisma.carga.create({
        data: {
          centroId,
          usuarioId: 'u',
          filasTotales: 0,
          filasValidas: 0,
          citasCreadas: 0,
          citasExistentes: 0,
          morbilidadExcluida: 0,
          repetidasEnArchivo: 0,
          erroresTotal: 0,
          excluyoMorbilidad: false,
        },
      })
    ).id;
    if ((await prisma.motivoLlamada.count()) === 0) {
      await prisma.motivoLlamada.create({
        data: { codigo: `M${sufijo}`, descripcion: 'Motivo prueba', orden: 1 },
      });
    }
  });

  afterAll(async () => {
    await prisma.$transaction([
      prisma.llamadaEntrante.deleteMany({ where: { centroId } }),
      prisma.cita.deleteMany({ where: { centroId } }),
      prisma.consentimiento.deleteMany(),
      prisma.paciente.deleteMany({ where: { nombre: { startsWith: 'Paciente' } } }),
      prisma.carga.deleteMany({ where: { centroId } }),
    ]);
    await prisma.centro.deleteMany({ where: { id: centroId } });
    await app.close();
  });

  it('solo el administrador accede', async () => {
    await http()
      .get('/api/config/privacidad')
      .set(
        'Authorization',
        await tok({ sub: randomUUID(), realm_access: { roles: ['encargado'] } }),
      )
      .expect(403);
    await http()
      .get('/api/config/privacidad')
      .set('Authorization', await admin())
      .expect(200);
  });

  it('la retención anonimiza solo a quien lleva más de 12 meses sin citas y conserva la actividad', async () => {
    const viejo = await crearPaciente(500);
    const reciente = await crearPaciente(30);

    const simulado = await http()
      .post('/api/config/privacidad/retencion')
      .set('Authorization', await admin())
      .send({})
      .expect(201);
    expect(simulado.body.simulacion).toBe(true);
    expect(simulado.body.pacientes).toBeGreaterThanOrEqual(1);
    expect((await prisma.paciente.findUniqueOrThrow({ where: { id: viejo.id } })).nombre).toBe(
      viejo.nombre,
    );

    await http()
      .post('/api/config/privacidad/retencion')
      .set('Authorization', await admin())
      .send({ simular: false })
      .expect(400); // falta la confirmación
    const real = await http()
      .post('/api/config/privacidad/retencion')
      .set('Authorization', await admin())
      .send({ simular: false, confirmacion: 'ANONIMIZAR' })
      .expect(201);
    expect(real.body.simulacion).toBe(false);

    const a = await prisma.paciente.findUniqueOrThrow({ where: { id: viejo.id } });
    expect(a.nombre).toBe('Paciente anonimizado');
    expect(a.rut.startsWith(PREFIJO_ANON)).toBe(true);
    expect(a.telefonoCifrado).toBeNull();
    expect(a.telefonoHash).toBeNull();
    expect(a.fechaNacimiento?.toISOString().slice(0, 10)).toBe('1950-01-01'); // solo el año
    expect(a.sexo).toBe('F');
    // la actividad se conserva (estadísticas) pero sin texto libre ni RUT
    expect(await prisma.cita.count({ where: { pacienteId: viejo.id } })).toBe(1);
    expect(
      (await prisma.llamadaSaliente.findFirstOrThrow({ where: { cita: { pacienteId: viejo.id } } }))
        .observacion,
    ).toBeNull();
    const le = await prisma.llamadaEntrante.findFirstOrThrow({ where: { pacienteId: viejo.id } });
    expect(le.rut).toBe(a.rut);
    expect(le.observacion).toBeNull();

    const r = await prisma.paciente.findUniqueOrThrow({ where: { id: reciente.id } });
    expect(r.nombre).toBe(reciente.nombre);
    expect(r.telefonoCifrado).not.toBeNull();

    const auditoria = await prisma.auditEvent.findFirst({
      where: { accion: 'privacidad.retencion' },
      orderBy: { ocurrioEn: 'desc' },
    });
    expect(
      JSON.stringify(auditoria, (_k, v) => (typeof v === 'bigint' ? String(v) : v)),
    ).not.toContain(viejo.nombre);
  });

  it('la retención es idempotente', async () => {
    const r = await http()
      .post('/api/config/privacidad/retencion')
      .set('Authorization', await admin())
      .send({ simular: false, confirmacion: 'ANONIMIZAR' })
      .expect(201);
    expect(r.body.pacientes).toBe(0);
  });

  it('acceso/portabilidad entrega los datos sin enmascarar y lo audita', async () => {
    const p = await crearPaciente(30);
    const res = await http()
      .get(`/api/config/privacidad/pacientes/${p.id}/datos`)
      .set('Authorization', await admin())
      .expect(200);
    expect(res.body.paciente.rut).toBe(p.rut);
    expect(res.body.paciente.telefono).toBe('+56912345678');
    expect(res.body.citas).toHaveLength(1);
    expect(res.body.citas[0].llamadas[0].observacion).toBe('dato libre');
    expect(res.body.llamadasEntrantes).toHaveLength(1);
    const ev = await prisma.auditEvent.findFirstOrThrow({
      where: { accion: 'privacidad.acceso', recursoId: p.id },
    });
    expect(JSON.stringify(ev, (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(
      p.rut,
    );
    await http()
      .get(`/api/config/privacidad/pacientes/${randomUUID()}/datos`)
      .set('Authorization', await admin())
      .expect(404);
    await http()
      .get('/api/config/privacidad/pacientes/no-es-uuid/datos')
      .set('Authorization', await admin())
      .expect(404);
  });

  it('oposición: da de baja el WhatsApp y deja constancia', async () => {
    const p = await crearPaciente(30);
    await http()
      .post(`/api/config/privacidad/pacientes/${p.id}/oposicion`)
      .set('Authorization', await admin())
      .expect(201);
    const despues = await prisma.paciente.findUniqueOrThrow({ where: { id: p.id } });
    expect(despues.whatsappBaja).toBe(true);
    expect(despues.nombre).toBe(p.nombre); // no se borra nada
    const c = await prisma.consentimiento.findFirstOrThrow({ where: { pacienteId: p.id } });
    expect([c.estado, c.origen]).toEqual(['revocado', 'arco']);
  });

  it('supresión pide confirmación y motivo; borra también sexo y fecha de nacimiento', async () => {
    const p = await crearPaciente(30);
    const url = `/api/config/privacidad/pacientes/${p.id}/suprimir`;
    await http()
      .post(url)
      .set('Authorization', await admin())
      .send({ motivo: 'Solicitud ARCO folio 12' })
      .expect(400);
    await http()
      .post(url)
      .set('Authorization', await admin())
      .send({ motivo: 'x', confirmacion: 'SUPRIMIR' })
      .expect(400);
    await http()
      .post(url)
      .set('Authorization', await admin())
      .send({ motivo: 'Solicitud ARCO folio 12', confirmacion: 'SUPRIMIR' })
      .expect(201);
    const a = await prisma.paciente.findUniqueOrThrow({ where: { id: p.id } });
    expect(a.nombre).toBe('Paciente anonimizado');
    expect(a.fechaNacimiento).toBeNull();
    expect(a.sexo).toBeNull();
    expect(a.whatsappBaja).toBe(true);
    const ev = await prisma.auditEvent.findFirstOrThrow({
      where: { accion: 'privacidad.suprimir', recursoId: p.id },
    });
    expect(ev.detalle).toEqual({ motivo: 'Solicitud ARCO folio 12' });
  });

  it('la supresión también anonimiza las llamadas de su RUT sin paciente enlazado', async () => {
    const p = await crearPaciente(30);
    const motivo = await prisma.motivoLlamada.findFirstOrThrow();
    const suelta = await prisma.llamadaEntrante.create({
      data: {
        centroId,
        rut: p.rut,
        motivoId: motivo.id,
        observacion: 'dato libre suelto',
        usuarioId: 'u',
      },
    });
    const datos = await http()
      .get(`/api/config/privacidad/pacientes/${p.id}/datos`)
      .set('Authorization', await admin())
      .expect(200);
    expect(datos.body.llamadasEntrantes).toHaveLength(2); // la enlazada y la suelta
    await http()
      .post(`/api/config/privacidad/pacientes/${p.id}/suprimir`)
      .set('Authorization', await admin())
      .send({ motivo: 'Solicitud ARCO folio 99', confirmacion: 'SUPRIMIR' })
      .expect(201);
    const despues = await prisma.llamadaEntrante.findUniqueOrThrow({ where: { id: suelta.id } });
    expect(despues.rut.startsWith(PREFIJO_ANON)).toBe(true);
    expect(despues.observacion).toBeNull();
    expect(await prisma.llamadaEntrante.count({ where: { rut: p.rut } })).toBe(0);
  });

  it('anonimiza llamadas entrantes antiguas que nunca tuvieron paciente', async () => {
    const motivo = await prisma.motivoLlamada.findFirstOrThrow();
    const l = await prisma.llamadaEntrante.create({
      data: {
        centroId,
        rut: '11111111-1',
        motivoId: motivo.id,
        observacion: 'algo',
        usuarioId: 'u',
        creadaEn: hace(600),
      },
    });
    await http()
      .post('/api/config/privacidad/retencion')
      .set('Authorization', await admin())
      .send({ simular: false, confirmacion: 'ANONIMIZAR' })
      .expect(201);
    const despues = await prisma.llamadaEntrante.findUniqueOrThrow({ where: { id: l.id } });
    expect(despues.rut).toBe(`${PREFIJO_ANON}SIN-PACIENTE`);
    expect(despues.observacion).toBeNull();
  });
});
