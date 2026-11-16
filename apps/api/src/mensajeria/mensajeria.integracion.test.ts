/**
 * Integración de la confirmación por WhatsApp contra PostgreSQL REAL (cola en memoria y canal
 * simulado). La cola Redis (BullMQ) se prueba aparte. Se omite si no hay TEST_DATABASE_URL.
 */
import { createHmac, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { calcularDv, payloadBoton } from '@bh/shared';
import { AppModule } from '../app.module';
import { configurarApp } from '../app';
import { CifradoService } from '../cifrado/cifrado.service';
import { PrismaService } from '../prisma/prisma.service';
import { crearEmisor } from '../pruebas/ayudas';
import { CANAL, COLA_ENVIOS, RELOJ, VERIFICADOR_TOKEN } from '../tokens';
import { BarridoService } from './barrido.service';
import { ErrorCanal } from './canal';
import type { ColaEnMemoria } from './cola';
import type { SimuladorWhatsApp } from './simulador';

const URL_PRUEBAS = process.env.TEST_DATABASE_URL;
const SECRETO = 'secreto-de-prueba-meta';
const VERIFY = 'verify-de-prueba';
if (URL_PRUEBAS) {
  process.env.DATABASE_URL = URL_PRUEBAS;
  process.env.WHATSAPP_APP_SECRET = SECRETO;
  process.env.WHATSAPP_VERIFY_TOKEN = VERIFY;
}

const rutDe = (n: number) => `${n}-${calcularDv(String(n))}`;
const HORA = 3_600_000;
const DENTRO = new Date('2026-11-20T15:00:00Z'); // 12:00 en Chile (UTC-3): dentro de 09:00-18:00
const MADRUGADA = new Date('2026-11-20T08:00:00Z'); // 05:00 en Chile: fuera del horario

describe.skipIf(!URL_PRUEBAS)('Confirmación por WhatsApp (PostgreSQL real)', () => {
  const sufijo = randomUUID().slice(0, 6).toUpperCase();
  const CA = `WA${sufijo}`;
  const CB = `WB${sufijo}`;
  const base = 6_000_000 + Math.floor(Math.random() * 400_000) * 10;
  const FECHA = '2026-11-25';
  let n = 0; // contador de pacientes de esta ejecución

  let app: INestApplication;
  let prisma: PrismaService;
  let cifrado: CifradoService;
  let canal: SimuladorWhatsApp;
  let cola: ColaEnMemoria;
  let barrido: BarridoService;
  let emitir: Awaited<ReturnType<typeof crearEmisor>>['emitir'];
  let centroA: { id: string };
  let centroB: { id: string };
  let cargaA: { id: string };
  let cargaB: { id: string };
  const reloj = {
    t: DENTRO,
    ahora() {
      return this.t;
    },
  };
  const http = () => request(app.getHttpServer());

  const funcionariaA = async () =>
    `Bearer ${await emitir({ sub: randomUUID(), name: 'Funcionaria A', realm_access: { roles: ['funcionaria'] }, centro_id: CA })}`;
  const funcionariaB = async () =>
    `Bearer ${await emitir({ sub: randomUUID(), name: 'Funcionaria B', realm_access: { roles: ['funcionaria'] }, centro_id: CB })}`;
  const admin = async () =>
    `Bearer ${await emitir({ sub: randomUUID(), name: 'Admin', realm_access: { roles: ['administrador'] } })}`;

  /** Crea paciente + cita + tarea directamente (más rápido y controlable que importar). */
  async function cita(
    o: {
      centro?: 'A' | 'B';
      telefono?: string | null;
      nacimiento?: string;
      baja?: boolean;
      tipo?: 'cronico' | 'morbilidad';
      estado?: 'sin_enviar' | 'enviado' | 'sin_respuesta' | 'confirmado';
      hora?: string;
    } = {},
  ) {
    const i = n++;
    const rut = rutDe(base + i);
    const telefono = o.telefono === undefined ? `+569${20_000_000 + i}` : o.telefono;
    const centro = o.centro === 'B' ? centroB : centroA;
    const p = await prisma.paciente.create({
      data: {
        rut,
        nombre: `Paciente Prueba ${i}`,
        telefonoCifrado: telefono ? cifrado.cifrar(telefono) : null,
        telefonoHash: telefono ? cifrado.hashBusqueda(telefono) : null,
        whatsappBaja: o.baja ?? false,
        ...(o.nacimiento ? { fechaNacimiento: new Date(`${o.nacimiento}T00:00:00Z`) } : {}),
      },
    });
    const c = await prisma.cita.create({
      data: {
        centroId: centro.id,
        pacienteId: p.id,
        profesionalNombre: 'Dra. Prueba Secreta',
        profesionalClave: 'dra prueba secreta',
        fecha: new Date(`${FECHA}T00:00:00Z`),
        hora: o.hora ?? `${String(8 + (i % 10)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
        prestacion: 'Control DM2 diabetes',
        tipo: o.tipo ?? 'cronico',
        cargaId: (o.centro === 'B' ? cargaB : cargaA).id,
        tarea: {
          create: {
            estado: o.estado ?? 'sin_enviar',
            ...(o.estado === 'enviado' ? { enviadoEn: reloj.t } : {}),
          },
        },
      },
    });
    return { citaId: c.id, pacienteId: p.id, rut, telefono };
  }

  const crearEnvio = async (
    citaIds: string[],
    token?: string,
    extra: Record<string, unknown> = {},
  ) =>
    http()
      .post('/api/envios')
      .set('Authorization', token ?? (await funcionariaA()))
      .send({ citaIds, ...extra });
  const tarea = (citaId: string) => prisma.tareaContacto.findUniqueOrThrow({ where: { citaId } });
  const mensajeDe = (
    citaId: string,
    tipo: 'confirmacion' | 'recordatorio' | 'reagendamiento' = 'confirmacion',
  ) => prisma.mensaje.findUniqueOrThrow({ where: { citaId_tipo: { citaId, tipo } } });

  const meta = (v: { statuses?: unknown[]; messages?: unknown[] }) => ({
    object: 'whatsapp_business_account',
    entry: [
      { id: '1', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', ...v } }] },
    ],
  });
  const firmar = (raw: string) =>
    `sha256=${createHmac('sha256', SECRETO).update(raw).digest('hex')}`;
  const webhook = (payload: unknown, firma: 'valida' | 'invalida' | 'ninguna' = 'valida') => {
    const raw = JSON.stringify(payload);
    const r = http().post('/webhooks/whatsapp').set('Content-Type', 'application/json');
    if (firma === 'valida') r.set('X-Hub-Signature-256', firmar(raw));
    if (firma === 'invalida') r.set('X-Hub-Signature-256', `sha256=${'0'.repeat(64)}`);
    return r.send(raw);
  };
  const boton = (from: string, accion: 'SI' | 'NO' | 'BAJA', mensajeId: string) => ({
    id: `wamid.IN.${randomUUID()}`,
    from: from.replace(/\D/g, ''),
    type: 'button',
    button: { payload: payloadBoton(accion, mensajeId), text: accion },
  });
  const texto = (from: string, body: string) => ({
    id: `wamid.IN.${randomUUID()}`,
    from: from.replace(/\D/g, ''),
    type: 'text',
    text: { body },
  });

  /** Envía una cita ya existente y deja el mensaje «enviado». */
  async function enviada(o: Parameters<typeof cita>[0] = {}) {
    const c = await cita(o);
    const r = await crearEnvio([c.citaId]).then((x) => x);
    expect(r.status).toBe(201);
    await cola.drenar();
    return { ...c, mensaje: await mensajeDe(c.citaId) };
  }

  beforeAll(async () => {
    const { verificador, emitir: e } = await crearEmisor();
    emitir = e;
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
    canal = app.get(CANAL);
    cola = app.get(COLA_ENVIOS);
    barrido = app.get(BarridoService);
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
  });

  beforeEach(() => {
    reloj.t = DENTRO;
    canal.enviados.length = 0;
    canal.fallarSi = () => null;
    cola.pendientes.length = 0;
  });
  afterEach(async () => {
    await cola.drenar();
    await prisma.parametro.deleteMany({
      where: {
        clave: {
          in: [
            'envio.segundo_mensaje_adulto_mayor',
            'envio.horas_espera_respuesta',
            'envio.ventana_horaria',
            'mensajes.reagendamiento_info',
            'envio.limite_por_segundo',
          ],
        },
      },
    });
  });

  afterAll(async () => {
    const centros = { in: [centroA?.id, centroB?.id].filter(Boolean) as string[] };
    const pacientes = await prisma.paciente.findMany({
      where: { rut: { in: Array.from({ length: n }, (_, i) => rutDe(base + i)) } },
      select: { id: true },
    });
    const ids = pacientes.map((p) => p.id);
    await prisma.cita.deleteMany({ where: { centroId: centros } });
    await prisma.envio.deleteMany({ where: { centroId: centros } });
    await prisma.consentimiento.deleteMany({ where: { pacienteId: { in: ids } } });
    await prisma.paciente.deleteMany({ where: { id: { in: ids } } });
    await prisma.carga.deleteMany({ where: { centroId: centros } });
    await prisma.centro.deleteMany({ where: { id: centros } });
    await app.close();
  });

  // ============================================================================ listado y vista previa

  describe('listado y vista previa', () => {
    it('lista las citas del día con RUT/teléfono enmascarados, adulto mayor y quién se puede seleccionar', async () => {
      const normal = await cita();
      const mayor = await cita({ nacimiento: '1950-03-01' });
      const sinTel = await cita({ telefono: null });
      const baja = await cita({ baja: true });
      const ya = await cita({ estado: 'enviado' });
      const res = await http()
        .get(`/api/confirmaciones?fecha=${FECHA}`)
        .set('Authorization', await funcionariaA())
        .expect(200);
      const por = (id: string) => res.body.filas.find((f: { id: string }) => f.id === id);

      expect(por(normal.citaId)).toMatchObject({
        seleccionable: true,
        adultoMayor: false,
        estado: 'sin_enviar',
      });
      expect(por(mayor.citaId)).toMatchObject({ seleccionable: true, adultoMayor: true });
      expect(por(sinTel.citaId)).toMatchObject({
        seleccionable: false,
        motivoNoSeleccionable: 'sin_telefono',
        telefono: null,
      });
      expect(por(baja.citaId)).toMatchObject({
        seleccionable: false,
        motivoNoSeleccionable: 'baja',
      });
      expect(por(ya.citaId)).toMatchObject({
        seleccionable: false,
        motivoNoSeleccionable: 'ya_enviada',
        estado: 'enviado',
      });
      expect(por(normal.citaId).rut).toMatch(/\*\*\*/);
      expect(por(normal.citaId).telefono).toMatch(/\*\*\*\*/);
      expect(JSON.stringify(res.body)).not.toContain(normal.rut);
      expect(res.body.resumen.sin_enviar).toBeGreaterThanOrEqual(4);
      expect(res.body.opciones).toMatchObject({
        modo: 'simulador',
        puedeSimular: true,
        ventana: { desde: '09:00', hasta: '18:00' },
      });
    });

    it('el filtro por tipo funciona y el centro ajeno es 403', async () => {
      const m = await cita({ tipo: 'morbilidad' });
      const todos = await http()
        .get(`/api/confirmaciones?fecha=${FECHA}&tipo=todos`)
        .set('Authorization', await funcionariaA())
        .expect(200);
      const cron = await http()
        .get(`/api/confirmaciones?fecha=${FECHA}&tipo=cronico`)
        .set('Authorization', await funcionariaA())
        .expect(200);
      expect(todos.body.filas.some((f: { id: string }) => f.id === m.citaId)).toBe(true);
      expect(cron.body.filas.some((f: { id: string }) => f.id === m.citaId)).toBe(false);
      await http()
        .get(`/api/confirmaciones?fecha=${FECHA}&centro=${CB}`)
        .set('Authorization', await funcionariaA())
        .expect(403);
      await http()
        .get('/api/confirmaciones')
        .set('Authorization', await funcionariaA())
        .expect(400); // falta fecha
    });

    it('la vista previa cuenta qué se enviaría y muestra el texto SIN nombre, profesional ni prestación', async () => {
      const [a, b, sinTel, baja, ya] = [
        await cita(),
        await cita(),
        await cita({ telefono: null }),
        await cita({ baja: true }),
        await cita({ estado: 'enviado' }),
      ];
      const res = await http()
        .post('/api/envios/previsualizar')
        .set('Authorization', await funcionariaA())
        .send({ citaIds: [a, b, sinTel, baja, ya].map((c) => c.citaId) })
        .expect(201);
      expect(res.body).toMatchObject({
        aEnviar: 2,
        sinTelefono: 1,
        baja: 1,
        yaEnviadasOEnOtroEstado: 1,
        programadoPara: null,
      });
      expect(res.body.mensaje).toContain(`Centro A ${sufijo}`);
      expect(res.body.mensaje).toMatch(/25 de noviembre/);
      expect(res.body.mensaje).not.toMatch(/Paciente Prueba|Dra\. Prueba|DM2|diabetes/i);
      expect(await prisma.mensaje.count({ where: { citaId: { in: [a.citaId, b.citaId] } } })).toBe(
        0,
      ); // no escribe
    });
  });

  // ============================================================================ envío

  describe('envío masivo', () => {
    it('envía por WhatsApp con la plantilla, 3 parámetros y 2 botones; las citas pasan a «Enviado»', async () => {
      const cs = [await cita(), await cita(), await cita()];
      const res = await crearEnvio(cs.map((c) => c.citaId)).then((r) => r);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        solicitadas: 3,
        encoladas: 3,
        omitidasSinTelefono: 0,
        omitidasBaja: 0,
        omitidasEstado: 0,
        programadoPara: null,
      });
      await cola.drenar();

      expect(canal.enviados).toHaveLength(3);
      const e = canal.enviados[0]!;
      expect(e).toMatchObject({ tipo: 'plantilla', plantilla: 'confirmacion_hora_v1' });
      expect(e.parametros).toHaveLength(3);
      expect(e.para).toMatch(/^569\d{8}$/); // formato internacional sin "+"
      expect(e.payloadsBotones).toHaveLength(2);
      // PRIVACIDAD: ni nombre, ni profesional, ni prestación viajan a WhatsApp
      expect(JSON.stringify(canal.enviados)).not.toMatch(
        /Paciente Prueba|Dra\. Prueba|DM2|diabetes/i,
      );

      for (const c of cs) {
        expect(await tarea(c.citaId)).toMatchObject({
          estado: 'enviado',
          formaContacto: 'whatsapp',
        });
        expect(await mensajeDe(c.citaId)).toMatchObject({ estado: 'enviado' });
      }
      const envio = await http()
        .get(`/api/envios/${res.body.envioId}`)
        .set('Authorization', await funcionariaA())
        .expect(200);
      expect(envio.body).toMatchObject({
        terminado: true,
        mensajes: { enviado: 3, en_cola: 0, fallido: 0 },
      });
    });

    it('sin teléfono o con baja NO se envía y la cita pasa directo a «Sin respuesta» (a la lista de llamadas)', async () => {
      const ok = await cita();
      const sinTel = await cita({ telefono: null });
      const baja = await cita({ baja: true });
      const r = await crearEnvio([ok.citaId, sinTel.citaId, baja.citaId]);
      expect(r.body).toMatchObject({ encoladas: 1, omitidasSinTelefono: 1, omitidasBaja: 1 });
      await cola.drenar();
      expect(canal.enviados).toHaveLength(1);
      expect((await tarea(sinTel.citaId)).estado).toBe('sin_respuesta');
      expect((await tarea(baja.citaId)).estado).toBe('sin_respuesta');
      expect(
        await prisma.mensaje.count({ where: { citaId: { in: [sinTel.citaId, baja.citaId] } } }),
      ).toBe(0);
    });

    it('nunca envía dos veces a la misma cita (ni con doble clic ni en paralelo)', async () => {
      const c = await cita();
      await crearEnvio([c.citaId]).then((r) => expect(r.status).toBe(201));
      await cola.drenar();
      const otra = await crearEnvio([c.citaId]);
      expect(otra.body).toMatchObject({ encoladas: 0, omitidasEstado: 1 });

      const lote = [await cita(), await cita(), await cita(), await cita()].map((x) => x.citaId);
      const [a, b] = await Promise.all([crearEnvio(lote), crearEnvio(lote)]);
      expect(a.body.encoladas + b.body.encoladas).toBe(4);
      await cola.drenar();
      expect(canal.enviados).toHaveLength(1 + 4);
    });

    it('la funcionaria no puede enviar por otro centro ni con citas de otro centro', async () => {
      const deB = await cita({ centro: 'B' });
      await crearEnvio([deB.citaId], undefined, { centro: CB }).then((r) =>
        expect(r.status).toBe(403),
      );
      const r = await crearEnvio([deB.citaId]); // su propio centro, cita ajena: no existe para ella
      expect(r.body).toMatchObject({ encoladas: 0, omitidasEstado: 1 });
      await cola.drenar();
      expect(canal.enviados).toHaveLength(0);
      expect((await tarea(deB.citaId)).estado).toBe('sin_enviar');
    });

    it('valida el cuerpo: lista vacía, ids que no son UUID y más de 1.000', async () => {
      const h = await funcionariaA();
      await http().post('/api/envios').set('Authorization', h).send({ citaIds: [] }).expect(400);
      await http()
        .post('/api/envios')
        .set('Authorization', h)
        .send({ citaIds: ['x'] })
        .expect(400);
      await http()
        .post('/api/envios')
        .set('Authorization', h)
        .send({ citaIds: Array.from({ length: 1001 }, () => randomUUID()) })
        .expect(400);
    });

    it('fuera del horario permitido los mensajes esperan al próximo inicio de ventana', async () => {
      reloj.t = MADRUGADA; // 05:00 en Chile
      const c = await cita();
      const r = await crearEnvio([c.citaId]);
      expect(r.body.programadoPara).toBe('2026-11-20T12:00:00.000Z'); // 09:00 en Chile
      expect(cola.pendientes).toHaveLength(1);
      expect(cola.pendientes[0]!.retrasoMs).toBe(4 * HORA);
      expect(canal.enviados).toHaveLength(0);
      expect((await tarea(c.citaId)).estado).toBe('sin_enviar');

      // El procesador vuelve a comprobar el horario: si aún no es la hora, se reprograma.
      await cola.liberarPendientes();
      expect(canal.enviados).toHaveLength(0);
      expect(cola.pendientes).toHaveLength(1);
      // Llega la hora: sale.
      reloj.t = new Date('2026-11-20T12:05:00Z');
      await cola.liberarPendientes();
      expect(canal.enviados).toHaveLength(1);
      expect((await tarea(c.citaId)).estado).toBe('enviado');
    });

    it('respeta una ventana horaria configurada por el administrador', async () => {
      await http()
        .patch('/api/config/parametros/envio.ventana_horaria')
        .set('Authorization', await admin())
        .send({ valor: { desde: '13:00', hasta: '17:00' } })
        .expect(200);
      const c = await cita(); // ahora = 12:00 en Chile: antes de las 13:00
      const r = await crearEnvio([c.citaId]);
      expect(r.body.programadoPara).toBe('2026-11-20T16:00:00.000Z'); // 13:00 en Chile
    });
  });

  // ============================================================================ fallas del canal

  describe('fallas del canal', () => {
    it('error PERMANENTE (p. ej. número sin WhatsApp): mensaje fallido y la cita pasa a «Sin respuesta»', async () => {
      const c = await cita();
      canal.fallarSi = () => new ErrorCanal('no es un número de WhatsApp', true, '131026');
      await crearEnvio([c.citaId]);
      await cola.drenar();
      expect(await mensajeDe(c.citaId)).toMatchObject({ estado: 'fallido', errorCodigo: '131026' });
      expect((await tarea(c.citaId)).estado).toBe('sin_respuesta');
    });

    it('error transitorio que se recupera: se reintenta y termina enviado', async () => {
      const c = await cita();
      let llamadas = 0;
      canal.fallarSi = () =>
        ++llamadas <= 2 ? new ErrorCanal('límite de tasa', false, '130429') : null;
      await crearEnvio([c.citaId]);
      await cola.drenar();
      expect(canal.enviados).toHaveLength(1);
      expect(await mensajeDe(c.citaId)).toMatchObject({ estado: 'enviado' });
      expect((await mensajeDe(c.citaId)).intentos).toBeGreaterThanOrEqual(1);
    });

    it('error transitorio que no se recupera: tras agotar los reintentos queda fallido y sin respuesta', async () => {
      const c = await cita();
      canal.fallarSi = () => new ErrorCanal('caída del proveedor', false, '500');
      await crearEnvio([c.citaId]);
      await cola.drenar();
      expect(await mensajeDe(c.citaId)).toMatchObject({ estado: 'fallido', errorCodigo: '500' });
      expect((await tarea(c.citaId)).estado).toBe('sin_respuesta'); // nunca queda "colgada"
    });

    it('si la cita cambió de estado antes de salir (la funcionaria la confirmó por teléfono), no se envía', async () => {
      reloj.t = MADRUGADA;
      const c = await cita();
      await crearEnvio([c.citaId]); // queda diferido
      await prisma.tareaContacto.update({
        where: { citaId: c.citaId },
        data: { estado: 'confirmado' },
      });
      reloj.t = new Date('2026-11-20T13:00:00Z');
      await cola.liberarPendientes();
      expect(canal.enviados).toHaveLength(0);
      expect(await mensajeDe(c.citaId)).toMatchObject({ estado: 'fallido', errorCodigo: 'ESTADO' });
      expect((await tarea(c.citaId)).estado).toBe('confirmado'); // no se toca
    });
  });

  // ============================================================================ webhook

  describe('webhook de WhatsApp', () => {
    it('GET de verificación: devuelve el desafío solo con el token correcto', async () => {
      const ok = await http()
        .get('/webhooks/whatsapp')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '12345' })
        .expect(200);
      expect(ok.text).toBe('12345');
      await http()
        .get('/webhooks/whatsapp')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '1' })
        .expect(403);
      await http()
        .get('/webhooks/whatsapp')
        .query({ 'hub.mode': 'subscribe', 'hub.challenge': '1' })
        .expect(403);
    });

    it('rechaza firmas ausentes, inválidas o de otro cuerpo, y no cambia nada', async () => {
      const e = await enviada();
      const payload = meta({ messages: [boton(e.telefono!, 'SI', e.mensaje.id)] });
      await webhook(payload, 'ninguna').expect(401);
      await webhook(payload, 'invalida').expect(401);
      // firma correcta de OTRO cuerpo (manipulación)
      const raw = JSON.stringify(payload);
      await http()
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', firmar(raw + ' '))
        .send(raw)
        .expect(401);
      expect((await tarea(e.citaId)).estado).toBe('enviado');
    });

    it('rechaza cuerpos que no son del formato esperado (con firma válida)', async () => {
      await webhook({ entry: 'no-es-lista' }).expect(400);
    });

    it('estados de entrega: entregado y leído actualizan el mensaje con su hora', async () => {
      const e = await enviada();
      await webhook(
        meta({ statuses: [{ id: e.mensaje.proveedorId, status: 'delivered' }] }),
      ).expect(200);
      expect(await mensajeDe(e.citaId)).toMatchObject({ estado: 'entregado' });
      await webhook(meta({ statuses: [{ id: e.mensaje.proveedorId, status: 'read' }] })).expect(
        200,
      );
      const m = await mensajeDe(e.citaId);
      expect(m.estado).toBe('leido');
      expect(m.entregadoEn && m.leidoEn).toBeTruthy();
    });

    it('estados desordenados: «leído» antes de «entregado» no retrocede ni se pisa', async () => {
      const e = await enviada();
      await webhook(
        meta({
          statuses: [
            { id: e.mensaje.proveedorId, status: 'read' },
            { id: e.mensaje.proveedorId, status: 'delivered' },
          ],
        }),
      );
      expect((await mensajeDe(e.citaId)).estado).toBe('leido');
    });

    it('«failed»: el mensaje queda fallido y la cita pasa a «Sin respuesta» para que se llame', async () => {
      const e = await enviada();
      await webhook(
        meta({
          statuses: [{ id: e.mensaje.proveedorId, status: 'failed', errors: [{ code: 131047 }] }],
        }),
      ).expect(200);
      expect(await mensajeDe(e.citaId)).toMatchObject({ estado: 'fallido', errorCodigo: '131047' });
      expect((await tarea(e.citaId)).estado).toBe('sin_respuesta');
    });

    it('ignora estados de mensajes que no conoce', async () => {
      await webhook(meta({ statuses: [{ id: 'wamid.DESCONOCIDO', status: 'delivered' }] })).expect(
        200,
      );
    });
  });

  // ============================================================================ respuestas

  describe('respuestas del paciente', () => {
    it('botón «Sí»: la cita queda confirmada por WhatsApp', async () => {
      const e = await enviada();
      await webhook(meta({ messages: [boton(e.telefono!, 'SI', e.mensaje.id)] })).expect(200);
      expect(await tarea(e.citaId)).toMatchObject({
        estado: 'confirmado',
        respuesta: 'si',
        formaContacto: 'whatsapp',
      });
      expect((await tarea(e.citaId)).respondidoEn).toBeTruthy();
    });

    it('es idempotente: la misma respuesta entregada dos veces (reintento de Meta) se aplica una sola vez', async () => {
      const e = await enviada();
      const msg = boton(e.telefono!, 'NO', e.mensaje.id);
      await webhook(meta({ messages: [msg] })).expect(200);
      await webhook(meta({ messages: [msg] })).expect(200);
      expect(await prisma.mensajeEntrante.count({ where: { proveedorId: msg.id } })).toBe(1);
      expect(await prisma.liberacion.count({ where: { citaId: e.citaId } })).toBe(1);
      expect(
        await prisma.mensaje.count({ where: { citaId: e.citaId, tipo: 'reagendamiento' } }),
      ).toBe(1);
    });

    it('botón «No»: cancelado + «Liberar hora en AVIS» + mensaje de reagendamiento', async () => {
      await prisma.parametro.upsert({
        where: { clave: 'mensajes.reagendamiento_info' },
        update: { valor: 'Llame al Cesfam para reagendar.' },
        create: { clave: 'mensajes.reagendamiento_info', valor: 'Llame al Cesfam para reagendar.' },
      });
      const e = await enviada();
      canal.enviados.length = 0;
      await webhook(meta({ messages: [boton(e.telefono!, 'NO', e.mensaje.id)] })).expect(200);
      await cola.drenar();

      expect(await tarea(e.citaId)).toMatchObject({ estado: 'cancelado', respuesta: 'no' });
      expect(
        (await prisma.liberacion.findUniqueOrThrow({ where: { citaId: e.citaId } })).resueltaEn,
      ).toBeNull();
      expect(canal.enviados).toHaveLength(1);
      expect(canal.enviados[0]).toMatchObject({
        tipo: 'texto',
        texto: expect.stringContaining('Llame al Cesfam para reagendar.'),
      });
      expect((await mensajeDe(e.citaId, 'reagendamiento')).estado).toBe('enviado');
    });

    it('el mensaje de reagendamiento indica el teléfono del Cesfam del paciente (un solo número de WhatsApp)', async () => {
      await prisma.centro.update({
        where: { id: centroA.id },
        data: { telefonoContacto: '+56 72 255 0000' },
      });
      try {
        const e = await enviada();
        canal.enviados.length = 0;
        await webhook(meta({ messages: [boton(e.telefono!, 'NO', e.mensaje.id)] })).expect(200);
        await cola.drenar();
        expect(canal.enviados[0]).toMatchObject({
          texto: expect.stringContaining('llame al +56 72 255 0000'),
        });
      } finally {
        await prisma.centro.update({ where: { id: centroA.id }, data: { telefonoContacto: null } });
      }
    });

    it('sin teléfono configurado el mensaje de reagendamiento sale igual, sin número', async () => {
      const e = await enviada();
      canal.enviados.length = 0;
      await webhook(meta({ messages: [boton(e.telefono!, 'NO', e.mensaje.id)] })).expect(200);
      await cola.drenar();
      expect(canal.enviados[0]?.texto).not.toContain('llame al');
    });

    it('«Cancelado» NO es «Sin respuesta»: la cita sigue vigente en AVIS hasta que alguien la libere (RN-01)', async () => {
      const e = await enviada();
      await webhook(meta({ messages: [boton(e.telefono!, 'NO', e.mensaje.id)] }));
      const fhir = await http()
        .get(`/fhir/R4/Appointment/${e.citaId}`)
        .set('Authorization', await funcionariaA())
        .expect(200);
      expect(fhir.body.status).toBe('booked'); // el estado de la agenda no lo decide este sistema
    });

    it('una respuesta que llega con la cita ya cancelada o confirmada no cambia nada', async () => {
      const e = await enviada();
      await webhook(meta({ messages: [boton(e.telefono!, 'NO', e.mensaje.id)] }));
      await webhook(meta({ messages: [boton(e.telefono!, 'SI', e.mensaje.id)] }));
      expect((await tarea(e.citaId)).estado).toBe('cancelado');
      const f = await enviada();
      await webhook(meta({ messages: [boton(f.telefono!, 'SI', f.mensaje.id)] }));
      await webhook(meta({ messages: [boton(f.telefono!, 'NO', f.mensaje.id)] }));
      expect((await tarea(f.citaId)).estado).toBe('confirmado');
    });

    it('una respuesta tardía a una cita ya en «Sin respuesta» sí se acepta', async () => {
      const e = await enviada();
      reloj.t = new Date(reloj.t.getTime() + 25 * HORA);
      await barrido.ejecutar();
      expect((await tarea(e.citaId)).estado).toBe('sin_respuesta');
      await webhook(meta({ messages: [boton(e.telefono!, 'SI', e.mensaje.id)] }));
      expect((await tarea(e.citaId)).estado).toBe('confirmado');
    });

    it('la respuesta debe venir del teléfono al que se escribió', async () => {
      const e = await enviada();
      await webhook(meta({ messages: [boton('+56999999999', 'SI', e.mensaje.id)] })).expect(200);
      expect((await tarea(e.citaId)).estado).toBe('enviado');
      expect(
        (
          await prisma.mensajeEntrante.findFirstOrThrow({
            where: { citaId: e.citaId },
            orderBy: { recibidoEn: 'desc' },
          })
        ).resultado,
      ).toBe('telefono_distinto');
    });

    it('texto libre «Sí» / «No»: se aplica si ese teléfono tiene UNA sola cita esperando', async () => {
      const a = await enviada();
      await webhook(meta({ messages: [texto(a.telefono!, ' Sí ')] }));
      expect((await tarea(a.citaId)).estado).toBe('confirmado');
      const b = await enviada();
      await webhook(meta({ messages: [texto(b.telefono!, 'No puedo')] }));
      expect((await tarea(b.citaId)).estado).toBe('cancelado');
    });

    it('texto libre ambiguo (dos citas esperando en el mismo teléfono) o ininteligible: no se adivina', async () => {
      const tel = '+56977000001';
      const a = await enviada({ telefono: tel });
      const b = await enviada({ telefono: tel });
      await webhook(meta({ messages: [texto(tel, 'si')] }));
      expect((await tarea(a.citaId)).estado).toBe('enviado');
      expect((await tarea(b.citaId)).estado).toBe('enviado');
      const c = await enviada();
      await webhook(meta({ messages: [texto(c.telefono!, 'no sé si podré ir, quizás')] }));
      expect((await tarea(c.citaId)).estado).toBe('enviado');
    });

    it('«STOP»/«baja»: se registra la baja del número, sus citas pasan a llamada y no se les vuelve a escribir', async () => {
      const tel = '+56977000002';
      const a = await enviada({ telefono: tel });
      const hermano = await cita({ telefono: tel }); // otra persona que comparte el número
      await webhook(meta({ messages: [texto(tel, 'STOP')] })).expect(200);

      for (const c of [a, hermano]) {
        expect(
          (await prisma.paciente.findUniqueOrThrow({ where: { id: c.pacienteId } })).whatsappBaja,
        ).toBe(true);
        expect(
          await prisma.consentimiento.count({
            where: { pacienteId: c.pacienteId, estado: 'revocado' },
          }),
        ).toBe(1);
      }
      expect((await tarea(a.citaId)).estado).toBe('sin_respuesta'); // ahora hay que llamarle

      canal.enviados.length = 0;
      const r = await crearEnvio([hermano.citaId]);
      expect(r.body).toMatchObject({ encoladas: 0, omitidasBaja: 1 });
      expect(canal.enviados).toHaveLength(0);
    });

    it('«No quiero recibir más mensajes» es una baja, no un «No» a la cita', async () => {
      const e = await enviada();
      await webhook(meta({ messages: [texto(e.telefono!, 'No quiero recibir más mensajes')] }));
      expect(
        (await prisma.paciente.findUniqueOrThrow({ where: { id: e.pacienteId } })).whatsappBaja,
      ).toBe(true);
      expect((await tarea(e.citaId)).estado).toBe('sin_respuesta'); // no "cancelado"
      expect(await prisma.liberacion.count({ where: { citaId: e.citaId } })).toBe(0);
    });

    it('no guarda el texto del paciente, solo el resultado', async () => {
      const e = await enviada();
      const msg = texto(e.telefono!, 'sí, voy mañana con mi hija Carolina');
      await webhook(meta({ messages: [msg] }));
      const fila = await prisma.mensajeEntrante.findUniqueOrThrow({
        where: { proveedorId: msg.id },
      });
      expect(JSON.stringify(fila)).not.toMatch(/Carolina|hija/);
    });
  });

  // ============================================================================ vencimientos

  describe('vencimiento de respuestas (barrido)', () => {
    it('pasadas 24 h sin respuesta la cita pasa a «Sin respuesta» y NUNCA a «Cancelado»', async () => {
      const e = await enviada();
      reloj.t = new Date(reloj.t.getTime() + 23 * HORA);
      expect((await barrido.ejecutar()).vencidas).toBe(0);
      reloj.t = new Date(reloj.t.getTime() + 2 * HORA);
      const r = await barrido.ejecutar();
      expect(r.vencidas).toBeGreaterThanOrEqual(1);
      expect((await tarea(e.citaId)).estado).toBe('sin_respuesta');
    });

    it('las citas ya respondidas no se tocan', async () => {
      const e = await enviada();
      await webhook(meta({ messages: [boton(e.telefono!, 'SI', e.mensaje.id)] }));
      reloj.t = new Date(reloj.t.getTime() + 48 * HORA);
      await barrido.ejecutar();
      expect((await tarea(e.citaId)).estado).toBe('confirmado');
    });

    it('a mitad de la espera, el adulto mayor recibe UN recordatorio; el menor de 65 no', async () => {
      const mayor = await enviada({ nacimiento: '1950-03-01' });
      const joven = await enviada({ nacimiento: '1990-03-01' });
      const sinDato = await enviada();
      canal.enviados.length = 0;
      // +21 h = 09:00 del día siguiente: pasó la mitad de la espera (12 h) y aún se puede escribir.
      reloj.t = new Date(reloj.t.getTime() + 21 * HORA);
      const r = await barrido.ejecutar();
      await cola.drenar();
      expect(r.recordatorios).toBe(1);
      expect(canal.enviados).toHaveLength(1);
      expect(canal.enviados[0]).toMatchObject({ plantilla: 'recordatorio_hora_v1' });
      expect(
        await prisma.mensaje.count({ where: { citaId: mayor.citaId, tipo: 'recordatorio' } }),
      ).toBe(1);
      expect(
        await prisma.mensaje.count({
          where: { citaId: { in: [joven.citaId, sinDato.citaId] }, tipo: 'recordatorio' },
        }),
      ).toBe(0);

      // segunda pasada: no se vuelve a enviar
      await barrido.ejecutar();
      await cola.drenar();
      expect(canal.enviados).toHaveLength(1);
      expect((await tarea(mayor.citaId)).estado).toBe('enviado'); // sigue esperando respuesta
    });

    it('el recordatorio se puede desactivar por parámetro', async () => {
      await http()
        .patch('/api/config/parametros/envio.segundo_mensaje_adulto_mayor')
        .set('Authorization', await admin())
        .send({ valor: false })
        .expect(200);
      const mayor = await enviada({ nacimiento: '1950-03-01' });
      canal.enviados.length = 0;
      reloj.t = new Date(reloj.t.getTime() + 13 * HORA);
      expect((await barrido.ejecutar()).recordatorios).toBe(0);
      expect(
        await prisma.mensaje.count({ where: { citaId: mayor.citaId, tipo: 'recordatorio' } }),
      ).toBe(0);
    });

    it('la espera es configurable', async () => {
      await http()
        .patch('/api/config/parametros/envio.horas_espera_respuesta')
        .set('Authorization', await admin())
        .send({ valor: 2 })
        .expect(200);
      const e = await enviada();
      reloj.t = new Date(reloj.t.getTime() + 3 * HORA);
      await barrido.ejecutar();
      expect((await tarea(e.citaId)).estado).toBe('sin_respuesta');
    });
  });

  // ============================================================================ simulación (demo)

  describe('simulación de respuestas (solo demo)', () => {
    it('contesta por el mismo camino que el webhook real y deja resultados variados', async () => {
      const cs = [];
      for (let i = 0; i < 30; i++) cs.push(await cita());
      await crearEnvio(cs.map((c) => c.citaId));
      await cola.drenar();
      const r = await http()
        .post('/api/envios/simular-respuestas')
        .set('Authorization', await funcionariaA())
        .send({})
        .expect(201);
      expect(
        r.body.confirmadas +
          r.body.canceladas +
          r.body.bajas +
          r.body.sinResponder +
          r.body.sinEntregar,
      ).toBeGreaterThanOrEqual(30);
      const estados = await prisma.tareaContacto.groupBy({
        by: ['estado'],
        where: { citaId: { in: cs.map((c) => c.citaId) } },
        _count: { _all: true },
      });
      const n = (e: string) => estados.find((x) => x.estado === e)?._count._all ?? 0;
      expect(n('confirmado')).toBe(r.body.confirmadas);
      expect(n('cancelado')).toBe(r.body.canceladas);
      expect(n('confirmado') + n('enviado') + n('cancelado') + n('sin_respuesta')).toBe(30);
      expect(n('cancelado')).toBeGreaterThan(0);
    });

    it('requiere rol con acceso al módulo', async () => {
      const sinRol = `Bearer ${await emitir({ sub: randomUUID(), name: 'X', realm_access: { roles: [] } })}`;
      await http()
        .post('/api/envios/simular-respuestas')
        .set('Authorization', sinRol)
        .send({})
        .expect(403);
    });
  });

  // ============================================================================ liberaciones

  describe('horas por liberar en AVIS', () => {
    it('lista las pendientes de su centro, se pueden resolver una vez y quedan auditadas', async () => {
      const e = await enviada();
      await webhook(meta({ messages: [boton(e.telefono!, 'NO', e.mensaje.id)] }));
      const h = await funcionariaA();
      const pend = await prisma.liberacion.findUniqueOrThrow({ where: { citaId: e.citaId } });
      const lista = await http().get('/api/liberaciones').set('Authorization', h).expect(200);
      expect(lista.body.some((x: { id: string }) => x.id === pend.id)).toBe(true);
      expect(JSON.stringify(lista.body)).not.toContain(e.rut); // RUT enmascarado

      await http()
        .post(`/api/liberaciones/${pend.id}/resolver`)
        .set('Authorization', h)
        .expect(201);
      expect(
        (await prisma.liberacion.findUniqueOrThrow({ where: { id: pend.id } })).resueltaEn,
      ).toBeTruthy();
      await http()
        .post(`/api/liberaciones/${pend.id}/resolver`)
        .set('Authorization', h)
        .expect(404); // ya resuelta
      expect(
        await prisma.auditEvent.count({
          where: { accion: 'liberacion.resolver', recursoId: pend.id },
        }),
      ).toBe(1);
    });

    it('otro centro no ve ni puede resolver sus liberaciones', async () => {
      const e = await enviada();
      await webhook(meta({ messages: [boton(e.telefono!, 'NO', e.mensaje.id)] }));
      const pend = await prisma.liberacion.findUniqueOrThrow({ where: { citaId: e.citaId } });
      const hB = await funcionariaB();
      const lista = await http().get('/api/liberaciones').set('Authorization', hB).expect(200);
      expect(lista.body.some((x: { id: string }) => x.id === pend.id)).toBe(false);
      await http()
        .post(`/api/liberaciones/${pend.id}/resolver`)
        .set('Authorization', hB)
        .expect(404);
    });
  });

  // ============================================================================ parámetros

  describe('FHIR: Task, Communication y AppointmentResponse', () => {
    it('cita confirmada: Task completada, AppointmentResponse «accepted» y la Communication de WhatsApp', async () => {
      const e = await enviada();
      await webhook(meta({ messages: [boton(e.telefono!, 'SI', e.mensaje.id)] }));
      const h = await funcionariaA();
      const t = await http()
        .get(`/fhir/R4/Task?focus=Appointment/${e.citaId}`)
        .set('Authorization', h)
        .expect(200);
      expect(t.headers['content-type']).toContain('application/fhir+json');
      expect(t.body.total).toBe(1);
      expect(t.body.entry[0].resource).toMatchObject({
        status: 'completed',
        businessStatus: { coding: [{ code: 'confirmado' }] },
      });

      const r = await http()
        .get(`/fhir/R4/AppointmentResponse?appointment=${e.citaId}`)
        .set('Authorization', h)
        .expect(200);
      expect(r.body.entry[0].resource.participantStatus).toBe('accepted');

      const c = await http()
        .get(`/fhir/R4/Communication?appointment=${e.citaId}`)
        .set('Authorization', h)
        .expect(200);
      expect(c.body.total).toBe(1);
      expect(c.body.entry[0].resource).toMatchObject({
        status: 'in-progress',
        medium: [{ coding: [{ code: 'whatsapp' }] }],
      });
      expect(JSON.stringify(c.body)).not.toContain(e.telefono!); // nunca el teléfono
    });

    it('respuesta «No»: AppointmentResponse «declined» y la tarea «liberar hora en AVIS» pendiente', async () => {
      const e = await enviada();
      await webhook(meta({ messages: [boton(e.telefono!, 'NO', e.mensaje.id)] }));
      await cola.drenar();
      const h = await funcionariaA();
      const t = await http()
        .get(`/fhir/R4/Task?focus=Appointment/${e.citaId}`)
        .set('Authorization', h)
        .expect(200);
      const codigos = t.body.entry.map(
        (x: { resource: { code?: { coding: { code: string }[] } } }) =>
          x.resource.code?.coding[0]?.code,
      );
      expect(t.body.total).toBe(2);
      expect(codigos).toContain('liberar-hora-avis');
      const liberar = t.body.entry.find(
        (x: { resource: { code?: unknown } }) => x.resource.code,
      ).resource;
      expect(liberar.status).toBe('requested');

      const r = await http()
        .get(`/fhir/R4/AppointmentResponse?appointment=${e.citaId}`)
        .set('Authorization', h)
        .expect(200);
      expect(r.body.entry[0].resource.participantStatus).toBe('declined');
      const c = await http()
        .get(`/fhir/R4/Communication?appointment=${e.citaId}`)
        .set('Authorization', h)
        .expect(200);
      expect(c.body.total).toBe(2); // confirmación + reagendamiento
    });

    it('sin respuesta del paciente no hay AppointmentResponse', async () => {
      const e = await enviada();
      const r = await http()
        .get(`/fhir/R4/AppointmentResponse?appointment=${e.citaId}`)
        .set('Authorization', await funcionariaA())
        .expect(200);
      expect(r.body.total).toBe(0);
    });

    it('otro centro no puede consultar la cita (404) y falta el parámetro es 400', async () => {
      const e = await enviada();
      const hB = await funcionariaB();
      await http()
        .get(`/fhir/R4/Task?focus=Appointment/${e.citaId}`)
        .set('Authorization', hB)
        .expect(404);
      await http()
        .get(`/fhir/R4/Communication?appointment=${e.citaId}`)
        .set('Authorization', hB)
        .expect(404);
      await http()
        .get('/fhir/R4/Task')
        .set('Authorization', await funcionariaA())
        .expect(400);
      await http()
        .get('/fhir/R4/Communication?appointment=no-es-uuid')
        .set('Authorization', await funcionariaA())
        .expect(400);
    });
  });

  describe('parámetros de operación', () => {
    it('el administrador los ve y edita; valores inválidos se rechazan; queda auditado', async () => {
      const h = await admin();
      const lista = await http().get('/api/config/parametros').set('Authorization', h).expect(200);
      expect(lista.body.map((p: { clave: string }) => p.clave)).toEqual(
        expect.arrayContaining(['envio.ventana_horaria', 'envio.limite_por_segundo']),
      );
      await http()
        .patch('/api/config/parametros/envio.limite_por_segundo')
        .set('Authorization', h)
        .send({ valor: 20 })
        .expect(200);
      await http()
        .patch('/api/config/parametros/envio.limite_por_segundo')
        .set('Authorization', h)
        .send({ valor: 9999 })
        .expect(400);
      await http()
        .patch('/api/config/parametros/envio.ventana_horaria')
        .set('Authorization', h)
        .send({ valor: { desde: '18:00', hasta: '09:00' } })
        .expect(400);
      await http()
        .patch('/api/config/parametros/no.existe')
        .set('Authorization', h)
        .send({ valor: 1 })
        .expect(400);
      await http()
        .patch('/api/config/parametros/envio.limite_por_segundo')
        .set('Authorization', h)
        .send({})
        .expect(400);
      expect(
        await prisma.auditEvent.count({
          where: { accion: 'parametro.actualizar', recursoId: 'envio.limite_por_segundo' },
        }),
      ).toBeGreaterThanOrEqual(1);
    });
    it('funcionaria y encargado no pueden editarlos', async () => {
      await http()
        .patch('/api/config/parametros/envio.limite_por_segundo')
        .set('Authorization', await funcionariaA())
        .send({ valor: 5 })
        .expect(403);
      await http()
        .get('/api/config/parametros')
        .set('Authorization', await funcionariaA())
        .expect(403);
    });
  });
});
