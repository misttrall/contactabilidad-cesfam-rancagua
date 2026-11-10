/**
 * Pendientes por llamar, llamadas entrantes, historial y revelación de datos contra PostgreSQL REAL.
 * Se omite si no hay TEST_DATABASE_URL.
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
import { RELOJ, VERIFICADOR_TOKEN } from '../tokens';

const URL_PRUEBAS = process.env.TEST_DATABASE_URL;
if (URL_PRUEBAS) process.env.DATABASE_URL = URL_PRUEBAS;

const rutDe = (n: number) => `${n}-${calcularDv(String(n))}`;
const HORA = 3_600_000;
const AHORA = new Date('2026-11-20T15:00:00Z'); // 12:00 en Chile
type EstadoTarea = 'sin_enviar' | 'enviado' | 'sin_respuesta' | 'confirmado' | 'cancelado';

describe.skipIf(!URL_PRUEBAS)('Llamadas (PostgreSQL real)', () => {
  const sufijo = randomUUID().slice(0, 6).toUpperCase();
  const CA = `LA${sufijo}`;
  const CB = `LB${sufijo}`;
  const base = 8_000_000 + Math.floor(Math.random() * 400_000) * 10;
  let n = 0;

  let app: INestApplication;
  let prisma: PrismaService;
  let cifrado: CifradoService;
  let emitir: Awaited<ReturnType<typeof crearEmisor>>['emitir'];
  let centroA: { id: string };
  let centroB: { id: string };
  let cargaA: { id: string };
  let cargaB: { id: string };
  let motivoSol: { id: string };
  let motivoOtros: { id: string };
  let motivoInactivo: { id: string };
  const subA = randomUUID();
  const http = () => request(app.getHttpServer());
  const tok = async (c: Record<string, unknown>) =>
    `Bearer ${await emitir({ name: 'Usuario Prueba', ...c })}`;
  const funcA = () =>
    tok({
      sub: subA,
      name: 'Funcionaria Ana',
      realm_access: { roles: ['funcionaria'] },
      centro_id: CA,
    });
  const funcB = () =>
    tok({ sub: randomUUID(), realm_access: { roles: ['funcionaria'] }, centro_id: CB });
  const encargado = () => tok({ sub: randomUUID(), realm_access: { roles: ['encargado'] } });

  async function cita(
    o: {
      centro?: 'A' | 'B';
      estado?: EstadoTarea;
      fecha?: string;
      hora?: string;
      nacimiento?: string;
      enviadoHaceHoras?: number;
      telefono?: string | null;
    } = {},
  ) {
    const i = n++;
    const rut = rutDe(base + i);
    const telefono = o.telefono === undefined ? `+569${30_000_000 + i}` : o.telefono;
    const centro = o.centro === 'B' ? centroB : centroA;
    const p = await prisma.paciente.create({
      data: {
        rut,
        nombre: `Paciente Llamada ${i}`,
        telefonoCifrado: telefono ? cifrado.cifrar(telefono) : null,
        telefonoHash: telefono ? cifrado.hashBusqueda(telefono) : null,
        ...(o.nacimiento ? { fechaNacimiento: new Date(`${o.nacimiento}T00:00:00Z`) } : {}),
      },
    });
    const c = await prisma.cita.create({
      data: {
        centroId: centro.id,
        pacienteId: p.id,
        profesionalNombre: 'Dra. Prueba',
        profesionalClave: 'dra prueba',
        fecha: new Date(`${o.fecha ?? '2026-11-25'}T00:00:00Z`),
        hora: o.hora ?? `${String(8 + (i % 9)).padStart(2, '0')}:00`,
        prestacion: 'Control crónico',
        tipo: 'cronico',
        cargaId: (o.centro === 'B' ? cargaB : cargaA).id,
        tarea: {
          create: {
            estado: o.estado ?? 'sin_respuesta',
            ...(o.estado === 'enviado'
              ? { enviadoEn: new Date(AHORA.getTime() - (o.enviadoHaceHoras ?? 0) * HORA) }
              : {}),
          },
        },
      },
    });
    return { citaId: c.id, pacienteId: p.id, rut, telefono };
  }
  const tarea = (citaId: string) => prisma.tareaContacto.findUniqueOrThrow({ where: { citaId } });
  const resultado = async (citaId: string, body: unknown, token?: string) =>
    http()
      .post(`/api/pendientes/${citaId}/resultado`)
      .set('Authorization', token ?? (await funcA()))
      .send(body as object);
  const lista = async (token?: string, q = '') =>
    http()
      .get(`/api/pendientes${q}`)
      .set('Authorization', token ?? (await funcA()));

  beforeAll(async () => {
    const { verificador, emitir: e } = await crearEmisor();
    emitir = e;
    const reloj = { ahora: () => AHORA };
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICADOR_TOKEN)
      .useValue(verificador)
      .overrideProvider(RELOJ)
      .useValue(reloj)
      .compile();
    app = configurarApp(modulo.createNestApplication({ rawBody: true }));
    await app.init();
    prisma = app.get(PrismaService);
    cifrado = app.get(CifradoService);
    centroA = await prisma.centro.create({ data: { codigo: CA, nombre: `Centro A ${sufijo}` } });
    centroB = await prisma.centro.create({ data: { codigo: CB, nombre: `Centro B ${sufijo}` } });
    const carga = (centroId: string) =>
      prisma.carga.create({
        data: {
          centroId,
          usuarioId: 'test',
          filasTotales: 0,
          filasValidas: 0,
          citasCreadas: 0,
          citasExistentes: 0,
          morbilidadExcluida: 0,
          repetidasEnArchivo: 0,
          erroresTotal: 0,
          excluyoMorbilidad: true,
        },
      });
    cargaA = await carga(centroA.id);
    cargaB = await carga(centroB.id);
    motivoSol = await prisma.motivoLlamada.create({
      data: { codigo: `SOL${sufijo}`, descripcion: 'Solicitud de hora (prueba)' },
    });
    motivoOtros = await prisma.motivoLlamada.upsert({
      where: { codigo: 'OTROS' },
      update: { activo: true },
      create: { codigo: 'OTROS', descripcion: 'Otros' },
    });
    motivoInactivo = await prisma.motivoLlamada.create({
      data: { codigo: `OFF${sufijo}`, descripcion: 'Motivo inactivo', activo: false },
    });
    // El nombre de quien llamó sale de la tabla de usuarios (se alimenta al ingresar).
    await prisma.usuario.create({
      data: {
        keycloakId: subA,
        nombre: 'Funcionaria Ana',
        rol: 'funcionaria',
        centroId: centroA.id,
      },
    });
  });

  afterAll(async () => {
    const centros = { in: [centroA?.id, centroB?.id].filter(Boolean) as string[] };
    const ruts = Array.from({ length: n + 20 }, (_, i) => rutDe(base + i));
    const pacientes = await prisma.paciente.findMany({
      where: { rut: { in: ruts } },
      select: { id: true },
    });
    const ids = pacientes.map((p) => p.id);
    await prisma.llamadaEntrante.deleteMany({ where: { centroId: centros } });
    await prisma.cita.deleteMany({ where: { centroId: centros } }); // llamadas salientes, tareas y liberaciones en cascada
    await prisma.consentimiento.deleteMany({ where: { pacienteId: { in: ids } } });
    await prisma.paciente.deleteMany({ where: { id: { in: ids } } });
    await prisma.carga.deleteMany({ where: { centroId: centros } });
    await prisma.usuario.deleteMany({ where: { keycloakId: subA } });
    await prisma.centro.deleteMany({ where: { id: centros } });
    await prisma.motivoLlamada.deleteMany({
      where: { id: { in: [motivoSol?.id, motivoInactivo?.id].filter(Boolean) as string[] } },
    });
    await app.close();
  });

  // ================================================================================== pendientes

  describe('cola de pendientes', () => {
    it('incluye «Sin respuesta» y «Enviado» vencido; excluye lo demás (sin enviar, confirmado, cancelado, citas pasadas, otro centro)', async () => {
      const sinResp = await cita({ estado: 'sin_respuesta' });
      const vencida = await cita({ estado: 'enviado', enviadoHaceHoras: 24 * 5 });
      const reciente = await cita({ estado: 'enviado', enviadoHaceHoras: 0 });
      const sinEnviar = await cita({ estado: 'sin_enviar' });
      const confirmada = await cita({ estado: 'confirmado' });
      const cancelada = await cita({ estado: 'cancelado' });
      const pasada = await cita({ estado: 'sin_respuesta', fecha: '2026-11-18' });
      const deB = await cita({ estado: 'sin_respuesta', centro: 'B' });

      const r = await lista();
      expect(r.status).toBe(200);
      const ids = r.body.filas.map((f: { id: string }) => f.id);
      expect(ids).toEqual(expect.arrayContaining([sinResp.citaId, vencida.citaId]));
      for (const c of [reciente, sinEnviar, confirmada, cancelada, pasada, deB])
        expect(ids).not.toContain(c.citaId);
      expect(r.body.filas.find((f: { id: string }) => f.id === vencida.citaId).vencida).toBe(true);
      expect(r.body.filas.find((f: { id: string }) => f.id === sinResp.citaId).vencida).toBe(false);
    });

    it('adultos mayores primero, luego por fecha y hora; datos enmascarados', async () => {
      const joven = await cita({ hora: '08:00', fecha: '2026-11-24', nacimiento: '1990-01-01' });
      const mayorTarde = await cita({
        hora: '17:00',
        fecha: '2026-11-27',
        nacimiento: '1950-01-01',
      });
      const mayorTemprano = await cita({
        hora: '09:00',
        fecha: '2026-11-26',
        nacimiento: '1948-05-05',
      });
      const r = await lista();
      const ids = r.body.filas.map((f: { id: string }) => f.id);
      expect(ids.indexOf(mayorTemprano.citaId)).toBeLessThan(ids.indexOf(mayorTarde.citaId));
      expect(ids.indexOf(mayorTarde.citaId)).toBeLessThan(ids.indexOf(joven.citaId)); // aunque el joven sea más temprano
      const fila = r.body.filas.find((f: { id: string }) => f.id === mayorTemprano.citaId);
      expect(fila.adultoMayor).toBe(true);
      expect(fila.telefono).toMatch(/\*\*\*\*/);
      expect(JSON.stringify(r.body)).not.toContain(mayorTemprano.rut);
      expect(JSON.stringify(r.body)).not.toContain(mayorTemprano.telefono!);
    });

    it('la funcionaria no ve otro centro (403); el encargado debe indicar cuál', async () => {
      await lista(undefined, `?centro=${CB}`).then((r) => expect(r.status).toBe(403));
      const enc = await encargado();
      await lista(enc).then((r) => expect(r.status).toBe(400));
      const r = await lista(enc, `?centro=${CB}`);
      expect(r.status).toBe(200);
    });
  });

  describe('registro del resultado de una llamada', () => {
    it('«Confirmado»: la cita queda confirmada por llamada, sale de la cola y queda quién la registró', async () => {
      const c = await cita();
      const r = await resultado(c.citaId, {
        resultado: 'confirmado',
        observacion: 'Confirma que asiste',
      });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ estado: 'confirmado', liberarEnAvis: false });
      expect(await tarea(c.citaId)).toMatchObject({
        estado: 'confirmado',
        respuesta: 'si',
        formaContacto: 'llamada',
      });
      expect((await tarea(c.citaId)).respondidoEn).toBeTruthy();
      const fila = await prisma.llamadaSaliente.findFirstOrThrow({ where: { citaId: c.citaId } });
      expect(fila).toMatchObject({
        resultado: 'confirmado',
        usuarioId: subA,
        observacion: 'Confirma que asiste',
      });
      const cola = await lista();
      expect(cola.body.filas.some((f: { id: string }) => f.id === c.citaId)).toBe(false);
    });

    it('«Recado» y «No ubicado» NO cancelan: la cita sigue vigente en la cola, con su subestado y sus intentos', async () => {
      const c = await cita();
      await resultado(c.citaId, { resultado: 'recado' }).then((r) =>
        expect(r.body).toMatchObject({ estado: 'sin_respuesta', subestado: 'recado' }),
      );
      expect(await tarea(c.citaId)).toMatchObject({
        estado: 'sin_respuesta',
        subestado: 'recado',
        respuesta: null,
      });

      await resultado(c.citaId, { resultado: 'no_ubicado' }).then((r) =>
        expect(r.body).toMatchObject({ estado: 'sin_respuesta', subestado: 'no_ubicado' }),
      );
      expect((await tarea(c.citaId)).subestado).toBe('no_ubicado'); // se distingue del recado

      const fila = (await lista()).body.filas.find((f: { id: string }) => f.id === c.citaId);
      expect(fila).toMatchObject({
        intentos: 2,
        subestado: 'no_ubicado',
        ultimoIntento: { resultado: 'no_ubicado' },
      });
      expect(await prisma.liberacion.count({ where: { citaId: c.citaId } })).toBe(0);
      const fhir = await http()
        .get(`/fhir/R4/Appointment/${c.citaId}`)
        .set('Authorization', await funcA())
        .expect(200);
      expect(fhir.body.status).toBe('booked'); // RN-01: sin respuesta nunca cancela

      // a la tercera sí contesta: el estado final se alcanza desde «sin respuesta»
      await resultado(c.citaId, { resultado: 'confirmado' }).then((r) =>
        expect(r.status).toBe(201),
      );
      expect((await tarea(c.citaId)).estado).toBe('confirmado');
      expect(await prisma.llamadaSaliente.count({ where: { citaId: c.citaId } })).toBe(3); // los tres intentos quedan
    });

    it('«Cancelado»: se cancela y se crea la tarea «liberar hora en AVIS», visible en las liberaciones', async () => {
      const c = await cita();
      const r = await resultado(c.citaId, { resultado: 'cancelado' });
      expect(r.body).toMatchObject({ estado: 'cancelado', liberarEnAvis: true });
      expect(await tarea(c.citaId)).toMatchObject({
        estado: 'cancelado',
        respuesta: 'no',
        formaContacto: 'llamada',
      });
      const lib = await prisma.liberacion.findUniqueOrThrow({ where: { citaId: c.citaId } });
      expect(lib.resueltaEn).toBeNull();
      const pend = await http()
        .get('/api/liberaciones')
        .set('Authorization', await funcA())
        .expect(200);
      expect(pend.body.some((l: { id: string }) => l.id === lib.id)).toBe(true);
    });

    it('también se puede registrar sobre una cita «Enviada» o «Sin enviar» (se llamó sin esperar el WhatsApp)', async () => {
      const enviada = await cita({ estado: 'enviado' });
      const sinEnviar = await cita({ estado: 'sin_enviar' });
      await resultado(enviada.citaId, { resultado: 'confirmado' }).then((r) =>
        expect(r.status).toBe(201),
      );
      await resultado(sinEnviar.citaId, { resultado: 'confirmado' }).then((r) =>
        expect(r.status).toBe(201),
      );
    });

    it('si la cita ya está confirmada o cancelada responde 409 y no registra el intento', async () => {
      const c = await cita({ estado: 'confirmado' });
      await resultado(c.citaId, { resultado: 'recado' }).then((r) => expect(r.status).toBe(409));
      expect(await prisma.llamadaSaliente.count({ where: { citaId: c.citaId } })).toBe(0);
      const d = await cita({ estado: 'cancelado' });
      await resultado(d.citaId, { resultado: 'confirmado' }).then((r) =>
        expect(r.status).toBe(409),
      );
    });

    it('dos funcionarias que registran a la vez: una gana y la otra recibe 409 (sin doble registro)', async () => {
      const c = await cita();
      const t1 = await funcA();
      const t2 = await funcA();
      const [a, b] = await Promise.all([
        resultado(c.citaId, { resultado: 'confirmado' }, t1),
        resultado(c.citaId, { resultado: 'cancelado' }, t2),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(await prisma.llamadaSaliente.count({ where: { citaId: c.citaId } })).toBe(1);
    });

    it('valida la entrada: resultado desconocido, campos extra, observación larga, id mal formado', async () => {
      const c = await cita();
      await resultado(c.citaId, { resultado: 'cancelada' }).then((r) => expect(r.status).toBe(400));
      await resultado(c.citaId, { resultado: 'recado', estado: 'confirmado' }).then((r) =>
        expect(r.status).toBe(400),
      );
      await resultado(c.citaId, { resultado: 'recado', observacion: 'x'.repeat(501) }).then((r) =>
        expect(r.status).toBe(400),
      );
      await resultado('no-es-uuid', { resultado: 'recado' }).then((r) =>
        expect(r.status).toBe(404),
      );
      expect((await tarea(c.citaId)).estado).toBe('sin_respuesta'); // nada cambió
    });

    it('la funcionaria no puede registrar sobre citas de otro centro (404); el encargado sí', async () => {
      const deB = await cita({ centro: 'B' });
      await resultado(deB.citaId, { resultado: 'confirmado' }).then((r) =>
        expect(r.status).toBe(404),
      );
      expect((await tarea(deB.citaId)).estado).toBe('sin_respuesta');
      await resultado(deB.citaId, { resultado: 'confirmado' }, await encargado()).then((r) =>
        expect(r.status).toBe(201),
      );
    });

    it('queda auditado con el resultado, sin la observación (puede traer datos personales)', async () => {
      const c = await cita();
      await resultado(c.citaId, {
        resultado: 'recado',
        observacion: 'habló su hija Carolina, teléfono 99999',
      });
      const ev = await prisma.auditEvent.findFirstOrThrow({
        where: { accion: 'llamada.registrar', recursoId: c.citaId },
      });
      expect(ev.detalle).toEqual({ resultado: 'recado' });
      expect(JSON.stringify(ev, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toMatch(
        /Carolina|99999/,
      );
    });
  });

  describe('historial de contacto de una cita', () => {
    it('reúne los mensajes de WhatsApp y las llamadas con el nombre de quien las hizo', async () => {
      const c = await cita({ estado: 'enviado', enviadoHaceHoras: 30 });
      await prisma.mensaje.create({
        data: {
          citaId: c.citaId,
          pacienteId: c.pacienteId,
          tipo: 'confirmacion',
          plantilla: 'p',
          estado: 'leido',
          enviadoEn: AHORA,
        },
      });
      await resultado(c.citaId, { resultado: 'recado', observacion: 'Dejé mensaje con la madre' });
      const r = await http()
        .get(`/api/pendientes/${c.citaId}/contactos`)
        .set('Authorization', await funcA())
        .expect(200);
      expect(r.body.mensajes).toHaveLength(1);
      expect(r.body.mensajes[0]).toMatchObject({ tipo: 'confirmacion', estado: 'leido' });
      expect(r.body.llamadas).toHaveLength(1);
      expect(r.body.llamadas[0]).toMatchObject({
        resultado: 'recado',
        observacion: 'Dejé mensaje con la madre',
        registradoPor: 'Funcionaria Ana',
      });
    });
    it('otro centro no puede verlo', async () => {
      const c = await cita();
      await http()
        .get(`/api/pendientes/${c.citaId}/contactos`)
        .set('Authorization', await funcB())
        .expect(404);
    });
  });

  describe('revelar datos del paciente (auditado)', () => {
    it('muestra el teléfono completo solo al pedirlo y lo deja en la bitácora sin el valor', async () => {
      const c = await cita();
      const r = await http()
        .post(`/api/pacientes/${c.pacienteId}/revelar`)
        .set('Authorization', await funcA())
        .send({ campo: 'telefono' })
        .expect(201);
      expect(r.body).toEqual({ campo: 'telefono', valor: c.telefono });
      const ev = await prisma.auditEvent.findFirstOrThrow({
        where: { accion: 'dato.revelar', recursoId: c.pacienteId },
      });
      expect(ev.detalle).toEqual({ campo: 'telefono' });
      expect(
        JSON.stringify(ev, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
      ).not.toContain(c.telefono!.slice(-6));
    });
    it('también el RUT, con formato; y cada revelación queda registrada por separado', async () => {
      const c = await cita();
      const h = await funcA();
      const r = await http()
        .post(`/api/pacientes/${c.pacienteId}/revelar`)
        .set('Authorization', h)
        .send({ campo: 'rut' })
        .expect(201);
      expect(r.body.valor).toMatch(/^\d{1,2}\.\d{3}\.\d{3}-[\dK]$/);
      await http()
        .post(`/api/pacientes/${c.pacienteId}/revelar`)
        .set('Authorization', h)
        .send({ campo: 'rut' })
        .expect(201);
      expect(
        await prisma.auditEvent.count({
          where: { accion: 'dato.revelar', recursoId: c.pacienteId },
        }),
      ).toBe(2);
    });
    it('un paciente de otro centro no se puede revelar (404) y los campos se validan', async () => {
      const deB = await cita({ centro: 'B' });
      await http()
        .post(`/api/pacientes/${deB.pacienteId}/revelar`)
        .set('Authorization', await funcA())
        .send({ campo: 'telefono' })
        .expect(404);
      await http()
        .post(`/api/pacientes/${deB.pacienteId}/revelar`)
        .set('Authorization', await funcB())
        .send({ campo: 'direccion' })
        .expect(400);
      await http()
        .post('/api/pacientes/no-es-uuid/revelar')
        .set('Authorization', await funcA())
        .send({ campo: 'rut' })
        .expect(404);
    });
    it('un paciente sin teléfono devuelve null', async () => {
      const c = await cita({ telefono: null });
      const r = await http()
        .post(`/api/pacientes/${c.pacienteId}/revelar`)
        .set('Authorization', await funcA())
        .send({ campo: 'telefono' })
        .expect(201);
      expect(r.body.valor).toBeNull();
    });
  });

  // ================================================================================== llamada entrante

  describe('llamada entrante: búsqueda por RUT', () => {
    const buscar = async (rut: string, token?: string, centro = '') =>
      http()
        .get(`/api/pacientes/buscar?rut=${encodeURIComponent(rut)}${centro}`)
        .set('Authorization', token ?? (await funcA()));

    it('encuentra al paciente cargado en el centro, con datos enmascarados y sus próximas citas', async () => {
      const c = await cita({ estado: 'confirmado', nacimiento: '1950-02-02' });
      const r = await buscar(c.rut);
      expect(r.status).toBe(200);
      expect(r.body.encontrado).toBe(true);
      expect(r.body.paciente).toMatchObject({ id: c.pacienteId, adultoMayor: true });
      expect(r.body.paciente.telefono).toMatch(/\*\*\*\*/);
      expect(r.body.proximasCitas[0]).toMatchObject({ fecha: '2026-11-25', estado: 'confirmado' });
      expect(JSON.stringify(r.body)).not.toContain(c.telefono!);
    });
    it('acepta el RUT con puntos y guion', async () => {
      const c = await cita();
      const [cuerpo, dv] = c.rut.split('-');
      const conPuntos = `${cuerpo!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
      expect((await buscar(conPuntos)).body.encontrado).toBe(true);
    });
    it('un RUT válido que no está cargado: «no encontrado» (no es un error)', async () => {
      const r = await buscar(rutDe(base + 9000));
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ encontrado: false });
    });
    it('un paciente que solo tiene citas en OTRO centro se trata como no encontrado', async () => {
      const deB = await cita({ centro: 'B' });
      expect((await buscar(deB.rut)).body.encontrado).toBe(false);
      expect((await buscar(deB.rut, await funcB())).body.encontrado).toBe(true);
    });
    it('RUT inválido o ausente: 400', async () => {
      await buscar('1000001-9').then((r) => expect(r.status).toBe(400));
      await http()
        .get('/api/pacientes/buscar')
        .set('Authorization', await funcA())
        .expect(400);
    });
    it('el encargado debe indicar el centro; la funcionaria no puede usar otro', async () => {
      const c = await cita();
      await buscar(c.rut, await encargado()).then((r) => expect(r.status).toBe(400));
      await buscar(c.rut, await encargado(), `&centro=${CA}`).then((r) =>
        expect(r.body.encontrado).toBe(true),
      );
      await buscar(c.rut, undefined, `&centro=${CB}`).then((r) => expect(r.status).toBe(403));
    });
    it('cada búsqueda queda auditada SIN el RUT', async () => {
      const c = await cita();
      await buscar(c.rut);
      const ev = await prisma.auditEvent.findFirstOrThrow({
        where: { accion: 'paciente.buscar', recursoId: c.pacienteId },
      });
      expect(ev.detalle).toEqual({ encontrado: true });
      expect(
        JSON.stringify(ev, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
      ).not.toContain(String(base));
    });
  });

  describe('llamada entrante: registro', () => {
    const registrar = async (body: Record<string, unknown>, token?: string) =>
      http()
        .post('/api/llamadas-entrantes')
        .set('Authorization', token ?? (await funcA()))
        .send(body);

    it('con paciente cargado: queda enlazado, con quién la registró y el tiempo que tardó', async () => {
      const c = await cita();
      const r = await registrar({
        rut: c.rut,
        motivoId: motivoSol.id,
        observacion: 'Pide hora con la doctora',
        segundos: 18,
      });
      expect(r.status).toBe(201);
      expect(r.body.pacienteEncontrado).toBe(true);
      const fila = await prisma.llamadaEntrante.findUniqueOrThrow({ where: { id: r.body.id } });
      expect(fila).toMatchObject({
        centroId: centroA.id,
        pacienteId: c.pacienteId,
        usuarioId: subA,
        segundos: 18,
        observacion: 'Pide hora con la doctora',
      });
    });
    it('sin paciente cargado se registra igual, solo con el RUT', async () => {
      const rut = rutDe(base + 9100);
      const r = await registrar({ rut, motivoId: motivoSol.id });
      expect(r.status).toBe(201);
      expect(r.body.pacienteEncontrado).toBe(false);
      expect(
        await prisma.llamadaEntrante.findUniqueOrThrow({ where: { id: r.body.id } }),
      ).toMatchObject({ pacienteId: null, rut });
    });
    it('un paciente de otro centro no se enlaza', async () => {
      const deB = await cita({ centro: 'B' });
      const r = await registrar({ rut: deB.rut, motivoId: motivoSol.id });
      expect(r.body.pacienteEncontrado).toBe(false);
    });
    it('«Otros» exige el detalle y lo guarda; otros motivos no guardan detalle', async () => {
      const rut = rutDe(base + 9101);
      await registrar({ rut, motivoId: motivoOtros.id }).then((r) => expect(r.status).toBe(400));
      const ok = await registrar({
        rut,
        motivoId: motivoOtros.id,
        otroMotivo: 'Consulta por transporte',
      });
      expect(ok.status).toBe(201);
      expect(
        (await prisma.llamadaEntrante.findUniqueOrThrow({ where: { id: ok.body.id } })).otroMotivo,
      ).toBe('Consulta por transporte');
      const sol = await registrar({
        rut,
        motivoId: motivoSol.id,
        otroMotivo: 'texto que no corresponde',
      });
      expect(
        (await prisma.llamadaEntrante.findUniqueOrThrow({ where: { id: sol.body.id } })).otroMotivo,
      ).toBeNull();
    });
    it('rechaza motivo inexistente o inactivo, RUT inválido y campos desconocidos', async () => {
      const rut = rutDe(base + 9102);
      await registrar({ rut, motivoId: randomUUID() }).then((r) => expect(r.status).toBe(400));
      await registrar({ rut, motivoId: motivoInactivo.id }).then((r) => expect(r.status).toBe(400));
      await registrar({ rut: '1000001-9', motivoId: motivoSol.id }).then((r) =>
        expect(r.status).toBe(400),
      );
      await registrar({ rut, motivoId: motivoSol.id, pacienteId: randomUUID() }).then((r) =>
        expect(r.status).toBe(400),
      );
      await registrar({ rut, motivoId: motivoSol.id, segundos: -5 }).then((r) =>
        expect(r.status).toBe(400),
      );
    });
    it('la funcionaria no puede registrar en otro centro; el encargado indica cuál', async () => {
      const rut = rutDe(base + 9103);
      await registrar({ rut, motivoId: motivoSol.id, centro: CB }).then((r) =>
        expect(r.status).toBe(403),
      );
      await registrar({ rut, motivoId: motivoSol.id }, await encargado()).then((r) =>
        expect(r.status).toBe(400),
      );
      const r = await registrar({ rut, motivoId: motivoSol.id, centro: CB }, await encargado());
      expect(r.status).toBe(201);
      expect(
        (await prisma.llamadaEntrante.findUniqueOrThrow({ where: { id: r.body.id } })).centroId,
      ).toBe(centroB.id);
    });
    it('queda auditada con el motivo y el tiempo, sin RUT ni observaciones', async () => {
      const rut = rutDe(base + 9104);
      const r = await registrar({
        rut,
        motivoId: motivoSol.id,
        observacion: 'dato personal secreto',
        segundos: 25,
      });
      const ev = await prisma.auditEvent.findFirstOrThrow({
        where: { accion: 'llamada_entrante.registrar', recursoId: r.body.id },
      });
      expect(ev.detalle).toEqual({
        motivo: `SOL${sufijo}`,
        pacienteEncontrado: false,
        segundos: 25,
      });
      expect(JSON.stringify(ev, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toMatch(
        /secreto|9104/,
      );
    });
  });

  // ================================================================================== historial

  describe('historial de llamadas entrantes', () => {
    const hist = async (q: string, token?: string) =>
      http()
        .get(`/api/llamadas-entrantes${q}`)
        .set('Authorization', token ?? (await funcA()));
    const crearLlamada = (o: {
      centro?: 'A' | 'B';
      rut: string;
      pacienteId?: string;
      motivoId?: string;
      creadaEn: string;
      usuario?: string;
      obs?: string;
    }) =>
      prisma.llamadaEntrante.create({
        data: {
          centroId: (o.centro === 'B' ? centroB : centroA).id,
          rut: o.rut,
          motivoId: o.motivoId ?? motivoSol.id,
          usuarioId: o.usuario ?? subA,
          creadaEn: new Date(o.creadaEn),
          ...(o.pacienteId ? { pacienteId: o.pacienteId } : {}),
          ...(o.obs ? { observacion: o.obs } : {}),
        },
      });

    // Datos propios con una fecha lejana para no mezclarse con las llamadas de otras pruebas.
    const D = (dia: string, hora = '15:00:00') => `${dia}T${hora}Z`;
    const pac = { id: '', rut: '', nombre: '' };

    beforeAll(async () => {
      const c = await cita({ centro: 'A' });
      const p = await prisma.paciente.findUniqueOrThrow({ where: { id: c.pacienteId } });
      Object.assign(pac, { id: p.id, rut: p.rut, nombre: p.nombre });
      await crearLlamada({ rut: pac.rut, pacienteId: pac.id, creadaEn: D('2031-03-10') });
      await crearLlamada({
        rut: pac.rut,
        pacienteId: pac.id,
        creadaEn: D('2031-03-11'),
        motivoId: motivoOtros.id,
        obs: 'detalle visible',
      });
      await crearLlamada({ rut: rutDe(base + 9200), creadaEn: D('2031-03-12') });
      await crearLlamada({ rut: rutDe(base + 9201), creadaEn: D('2031-03-13') });
      await crearLlamada({ rut: rutDe(base + 9202), creadaEn: D('2031-03-14'), centro: 'B' });
      // Bordes del día en hora de Chile (marzo = UTC-3): 00:00 locales = 03:00Z
      await crearLlamada({ rut: rutDe(base + 9210), creadaEn: '2031-04-01T02:59:59Z' }); // 31-mar 23:59:59 local
      await crearLlamada({ rut: rutDe(base + 9211), creadaEn: '2031-04-01T03:00:00Z' }); // 01-abr 00:00:00 local
      await crearLlamada({ rut: rutDe(base + 9212), creadaEn: '2031-04-02T02:59:59Z' }); // 01-abr 23:59:59 local
      await crearLlamada({ rut: rutDe(base + 9213), creadaEn: '2031-04-02T03:00:00Z' }); // 02-abr 00:00:00 local
    });

    it('la funcionaria ve solo su centro, las más recientes primero, con RUT enmascarado y quién registró', async () => {
      const r = await hist('?desde=2031-03-10&hasta=2031-03-14');
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(4); // la del centro B no aparece
      const fechas = r.body.filas.map((f: { creadaEn: string }) => f.creadaEn);
      expect(fechas).toEqual([...fechas].sort().reverse());
      expect(r.body.filas.every((f: { centro: string }) => f.centro === CA)).toBe(true);
      expect(r.body.filas[0].rut).toMatch(/\*\*\*/);
      expect(JSON.stringify(r.body)).not.toContain(pac.rut);
      expect(r.body.filas.at(-1)).toMatchObject({
        paciente: pac.nombre,
        registradoPor: 'Funcionaria Ana',
      });
    });
    it('el encargado ve todos los centros o filtra por uno', async () => {
      const enc = await encargado();
      expect((await hist('?desde=2031-03-10&hasta=2031-03-14', enc)).body.total).toBe(5);
      const soloB = await hist(`?desde=2031-03-10&hasta=2031-03-14&centro=${CB}`, enc);
      expect(soloB.body.total).toBe(1);
      expect(soloB.body.filas[0].centro).toBe(CB);
    });
    it('la funcionaria no puede pedir otro centro', async () => {
      await hist(`?centro=${CB}`).then((r) => expect(r.status).toBe(403));
    });
    it('filtra por motivo y muestra el detalle de «Otros»', async () => {
      const r = await hist(`?desde=2031-03-10&hasta=2031-03-14&motivoId=${motivoOtros.id}`);
      expect(r.body.total).toBe(1);
      expect(r.body.filas[0]).toMatchObject({ motivo: 'Otros', observacion: 'detalle visible' });
    });
    it('busca por RUT exacto (con o sin formato) y por parte del nombre, sin distinguir mayúsculas', async () => {
      const porRut = await hist(
        `?desde=2031-03-10&hasta=2031-03-14&q=${encodeURIComponent(pac.rut)}`,
      );
      expect(porRut.body.total).toBe(2);
      const [cuerpo, dv] = pac.rut.split('-');
      const conPuntos = `${cuerpo!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
      expect(
        (await hist(`?desde=2031-03-10&hasta=2031-03-14&q=${encodeURIComponent(conPuntos)}`)).body
          .total,
      ).toBe(2);
      const porNombre = await hist(
        `?desde=2031-03-10&hasta=2031-03-14&q=${encodeURIComponent(pac.nombre.toUpperCase().slice(0, 14))}`,
      );
      expect(porNombre.body.total).toBe(2);
      expect((await hist('?desde=2031-03-10&hasta=2031-03-14&q=zzzzzz')).body.total).toBe(0);
    });
    it('los límites de fecha respetan el día en hora de Chile (no en UTC)', async () => {
      const r = await hist('?desde=2031-04-01&hasta=2031-04-01');
      expect(r.body.total).toBe(2); // 00:00:00 y 23:59:59 locales del 1 de abril; no las del 31 ni las del 2
      const ruts = r.body.filas.length;
      expect(ruts).toBe(2);
      expect((await hist('?desde=2031-04-02&hasta=2031-04-02')).body.total).toBe(1);
      expect((await hist('?desde=2031-03-31&hasta=2031-03-31')).body.total).toBe(1);
    });
    it('pagina en el servidor: total, páginas y orden estable', async () => {
      const p1 = await hist('?desde=2031-03-10&hasta=2031-03-14&tam=3&pagina=1');
      const p2 = await hist('?desde=2031-03-10&hasta=2031-03-14&tam=3&pagina=2');
      expect(p1.body).toMatchObject({ total: 4, tam: 3, paginas: 2, pagina: 1 });
      expect(p1.body.filas).toHaveLength(3);
      expect(p2.body.filas).toHaveLength(1);
      const ids = [...p1.body.filas, ...p2.body.filas].map((f: { id: string }) => f.id);
      expect(new Set(ids).size).toBe(4); // sin repetidas ni faltantes
      expect(
        (await hist('?desde=2031-03-10&hasta=2031-03-14&tam=3&pagina=9')).body.filas,
      ).toHaveLength(0);
    });
    it('valida los parámetros: tamaño máximo, fechas, búsqueda corta y motivo mal formado', async () => {
      for (const q of ['?tam=1000', '?pagina=0', '?desde=20-11-2026', '?q=a', '?motivoId=x']) {
        await hist(q).then((r) => expect(r.status, q).toBe(400));
      }
    });
  });

  // ================================================================================== FHIR

  describe('FHIR: Communication de llamadas', () => {
    it('Communication?patient= reúne mensajes y llamadas del paciente; queda auditado', async () => {
      const c = await cita({ estado: 'enviado', enviadoHaceHoras: 30 });
      await prisma.mensaje.create({
        data: {
          citaId: c.citaId,
          pacienteId: c.pacienteId,
          tipo: 'confirmacion',
          plantilla: 'p',
          estado: 'enviado',
          enviadoEn: AHORA,
        },
      });
      await resultado(c.citaId, {
        resultado: 'recado',
        observacion: 'texto libre que no debe salir',
      });
      await prisma.llamadaEntrante.create({
        data: {
          centroId: centroA.id,
          rut: c.rut,
          pacienteId: c.pacienteId,
          motivoId: motivoSol.id,
          usuarioId: subA,
        },
      });

      const antes = await prisma.auditEvent.count({
        where: { accion: 'paciente.leer', recursoId: c.pacienteId },
      });
      const r = await http()
        .get(`/fhir/R4/Communication?patient=Patient/${c.pacienteId}`)
        .set('Authorization', await funcA())
        .expect(200);
      expect(r.headers['content-type']).toContain('application/fhir+json');
      expect(r.body.total).toBe(3); // WhatsApp + llamada saliente + llamada entrante
      const medios = r.body.entry
        .map(
          (e: { resource: { medium: { coding: { code: string }[] }[] } }) =>
            e.resource.medium[0]!.coding[0]!.code,
        )
        .sort();
      expect(medios).toEqual(['telefono', 'telefono', 'whatsapp']);
      expect(JSON.stringify(r.body)).not.toMatch(/texto libre|\+569/);
      expect(
        await prisma.auditEvent.count({
          where: { accion: 'paciente.leer', recursoId: c.pacienteId },
        }),
      ).toBe(antes + 1);
    });
    it('otro centro: 404; id inválido: 400', async () => {
      const c = await cita();
      await http()
        .get(`/fhir/R4/Communication?patient=${c.pacienteId}`)
        .set('Authorization', await funcB())
        .expect(404);
      await http()
        .get('/fhir/R4/Communication?patient=x')
        .set('Authorization', await funcA())
        .expect(400);
    });
  });
});
