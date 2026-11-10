/**
 * Dashboard, reportes y exportación Excel contra PostgreSQL REAL. Se omite sin TEST_DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as XLSX from 'xlsx';
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
const AHORA = new Date('2026-11-20T15:00:00Z'); // 12:00 en Chile, viernes
type Estado = 'sin_enviar' | 'enviado' | 'sin_respuesta' | 'confirmado' | 'cancelado';

describe.skipIf(!URL_PRUEBAS)('Dashboard y reportes (PostgreSQL real)', () => {
  const sufijo = randomUUID().slice(0, 6).toUpperCase();
  const CA = `RA${sufijo}`;
  const CB = `RB${sufijo}`;
  const base = 6_000_000 + Math.floor(Math.random() * 400_000) * 10;
  let n = 0;

  let app: INestApplication;
  let prisma: PrismaService;
  let cifrado: CifradoService;
  let emitir: Awaited<ReturnType<typeof crearEmisor>>['emitir'];
  let centroA: { id: string };
  let centroB: { id: string };
  let cargaA: { id: string };
  let cargaB: { id: string };
  let motivoA: { id: string };
  let motivoB: { id: string };
  const http = () => request(app.getHttpServer());
  const tok = async (c: Record<string, unknown>) =>
    `Bearer ${await emitir({ name: 'Usuario Prueba', sub: randomUUID(), ...c })}`;
  const funcA = () => tok({ realm_access: { roles: ['funcionaria'] }, centro_id: CA });
  const encargado = () => tok({ realm_access: { roles: ['encargado'] } });
  const admin = () => tok({ realm_access: { roles: ['administrador'] } });
  const binario = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
    const trozos: Buffer[] = [];
    res.on('data', (t: Buffer) => trozos.push(t));
    res.on('end', () => cb(null, Buffer.concat(trozos)));
  };

  async function cita(o: {
    centro?: 'A' | 'B';
    estado: Estado;
    fecha: string;
    nacimiento?: string;
    sexo?: 'M' | 'F';
    whatsapp?: 'enviado' | 'fallido';
    respuesta?: 'whatsapp' | 'llamada';
  }) {
    const i = n++;
    const rut = rutDe(base + i);
    const telefono = `+569${40_000_000 + i}`;
    const centro = o.centro === 'B' ? centroB : centroA;
    const p = await prisma.paciente.create({
      data: {
        rut,
        nombre: `Paciente Reporte ${i}`,
        telefonoCifrado: cifrado.cifrar(telefono),
        telefonoHash: cifrado.hashBusqueda(telefono),
        ...(o.nacimiento ? { fechaNacimiento: new Date(`${o.nacimiento}T00:00:00Z`) } : {}),
        ...(o.sexo ? { sexo: o.sexo } : {}),
      },
    });
    const c = await prisma.cita.create({
      data: {
        centroId: centro.id,
        pacienteId: p.id,
        profesionalNombre: 'Dra. Prueba',
        profesionalClave: 'dra prueba',
        fecha: new Date(`${o.fecha}T00:00:00Z`),
        hora: `${String(8 + (i % 9)).padStart(2, '0')}:00`,
        prestacion: 'Control crónico',
        tipo: 'cronico',
        cargaId: (o.centro === 'B' ? cargaB : cargaA).id,
        tarea: {
          create: {
            estado: o.estado,
            ...(o.respuesta
              ? {
                  respuesta: o.estado === 'confirmado' ? 'si' : 'no',
                  formaContacto: o.respuesta,
                  respondidoEn: AHORA,
                }
              : {}),
          },
        },
        ...(o.whatsapp
          ? {
              mensajes: {
                create: {
                  pacienteId: p.id,
                  tipo: 'confirmacion',
                  estado: o.whatsapp,
                  plantilla: 'confirmacion_cita',
                },
              },
            }
          : {}),
      },
    });
    return { citaId: c.id, pacienteId: p.id };
  }

  async function llamadaEntrante(o: {
    centro?: 'A' | 'B';
    motivo: { id: string };
    paciente?: string;
    creada: string;
    segundos?: number;
  }) {
    await prisma.llamadaEntrante.create({
      data: {
        centroId: (o.centro === 'B' ? centroB : centroA).id,
        rut: rutDe(base + 500_000 + n++),
        motivoId: o.motivo.id,
        usuarioId: 'test',
        creadaEn: new Date(o.creada),
        ...(o.paciente ? { pacienteId: o.paciente } : {}),
        ...(o.segundos !== undefined ? { segundos: o.segundos } : {}),
      },
    });
  }

  beforeAll(async () => {
    const { verificador, emitir: e } = await crearEmisor();
    emitir = e;
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICADOR_TOKEN)
      .useValue(verificador)
      .overrideProvider(RELOJ)
      .useValue({ ahora: () => AHORA })
      .compile();
    app = configurarApp(modulo.createNestApplication({ rawBody: true }));
    await app.init();
    prisma = app.get(PrismaService);
    cifrado = app.get(CifradoService);
    // El nombre del centro A empieza con «=» para comprobar que el Excel lo neutraliza.
    centroA = await prisma.centro.create({ data: { codigo: CA, nombre: `=Centro A ${sufijo}` } });
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
    motivoA = await prisma.motivoLlamada.create({
      data: { codigo: `MA${sufijo}`, descripcion: `Motivo A ${sufijo}` },
    });
    motivoB = await prisma.motivoLlamada.create({
      data: { codigo: `MB${sufijo}`, descripcion: `Motivo B ${sufijo}` },
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
    await prisma.cita.deleteMany({ where: { centroId: centros } });
    await prisma.paciente.deleteMany({ where: { id: { in: ids } } });
    await prisma.carga.deleteMany({ where: { centroId: centros } });
    await prisma.centro.deleteMany({ where: { id: centros } });
    await prisma.motivoLlamada.deleteMany({
      where: { id: { in: [motivoA?.id, motivoB?.id].filter(Boolean) as string[] } },
    });
    await app.close();
  });

  // ===================================================================================== dashboard

  describe('dashboard', () => {
    const DIA = '2026-12-01';

    beforeAll(async () => {
      await cita({ estado: 'sin_enviar', fecha: DIA });
      await cita({ estado: 'enviado', fecha: DIA });
      await cita({ estado: 'enviado', fecha: DIA });
      await cita({ estado: 'confirmado', fecha: DIA, respuesta: 'whatsapp' });
      await cita({ estado: 'sin_respuesta', fecha: DIA });
      await cita({ estado: 'cancelado', fecha: DIA, respuesta: 'llamada' });
      await cita({ estado: 'sin_enviar', fecha: '2026-12-02' }); // otro día
      await cita({ estado: 'sin_enviar', fecha: DIA, centro: 'B' });
    });

    it('«Enviadas» es un KPI propio y no se mezcla con canceladas (D-03)', async () => {
      const r = await http()
        .get(`/api/dashboard?centro=${CA}&fecha=${DIA}`)
        .set('Authorization', await encargado())
        .expect(200);
      expect(r.body.kpis).toMatchObject({
        cargadas: 6,
        porEnviar: 1,
        enviadas: 2,
        confirmadas: 1,
        sinRespuesta: 1,
        canceladas: 1,
      });
    });

    it('la funcionaria solo ve su centro, aunque pida otro', async () => {
      const r = await http()
        .get(`/api/dashboard?centro=${CB}&fecha=${DIA}`)
        .set('Authorization', await funcA())
        .expect(403);
      expect(r.body.message).toBeTruthy();
      const propio = await http()
        .get(`/api/dashboard?fecha=${DIA}`)
        .set('Authorization', await funcA())
        .expect(200);
      expect(propio.body.kpis.cargadas).toBe(6);
    });

    it('sin centro, el encargado ve la suma de todos los centros', async () => {
      const r = await http()
        .get(`/api/dashboard?fecha=${DIA}`)
        .set('Authorization', await encargado())
        .expect(200);
      expect(r.body.kpis.cargadas).toBeGreaterThanOrEqual(7);
    });

    it('sin fecha usa hoy + anticipación (48 h por defecto) en hora de Chile', async () => {
      const r = await http()
        .get('/api/dashboard')
        .set('Authorization', await encargado())
        .expect(200);
      expect(r.body.hoy).toBe('2026-11-20');
      expect(r.body.fecha).toBe('2026-11-22');
    });

    it('lista próximas a confirmar sin RUT ni teléfono, y llamadas recientes con RUT enmascarado', async () => {
      await llamadaEntrante({ motivo: motivoA, creada: '2026-11-20T14:00:00Z' });
      const r = await http()
        .get(`/api/dashboard?centro=${CA}&fecha=${DIA}`)
        .set('Authorization', await encargado())
        .expect(200);
      expect(r.body.proximasAConfirmar.length).toBeGreaterThan(0);
      expect(r.body.llamadasEntrantesHoy ?? r.body.kpis.llamadasEntrantesHoy).toBe(1);
      const texto = JSON.stringify(r.body);
      expect(texto).not.toMatch(/\+569\d{8}/);
      expect(r.body.llamadasRecientes[0].rut).toMatch(/\*/);
    });

    it('las llamadas de «hoy» respetan el día chileno (23:30 del día anterior no cuenta)', async () => {
      await llamadaEntrante({ motivo: motivoA, creada: '2026-11-20T02:30:00Z' }); // 23:30 del 19, Chile
      const r = await http()
        .get(`/api/dashboard?centro=${CA}&fecha=${DIA}`)
        .set('Authorization', await encargado())
        .expect(200);
      expect(r.body.kpis.llamadasEntrantesHoy).toBe(1);
    });

    it('rechaza fechas inválidas', async () => {
      await http()
        .get('/api/dashboard?fecha=2026-13-45')
        .set('Authorization', await encargado())
        .expect(400);
    });
  });

  // ===================================================================================== reportes

  describe('resumen', () => {
    beforeAll(async () => {
      // Pacientes con edad/sexo conocidos para llamadas entrantes en noviembre de 2026
      const p1 = await cita({
        estado: 'sin_enviar',
        fecha: '2027-03-01',
        nacimiento: '1950-05-05',
        sexo: 'F',
      });
      const p2 = await cita({
        estado: 'sin_enviar',
        fecha: '2027-03-01',
        nacimiento: '1990-01-01',
        sexo: 'M',
      });
      await llamadaEntrante({
        motivo: motivoB,
        creada: '2026-11-10T15:00:00Z',
        paciente: p1.pacienteId,
        segundos: 20,
      });
      await llamadaEntrante({
        motivo: motivoB,
        creada: '2026-11-11T15:00:00Z',
        paciente: p2.pacienteId,
        segundos: 40,
      });
      await llamadaEntrante({ motivo: motivoA, creada: '2026-11-12T15:00:00Z', segundos: 30 });
      // fuera de rango
      await llamadaEntrante({ motivo: motivoA, creada: '2026-10-31T15:00:00Z' });

      // Citas de octubre con WhatsApp
      await cita({
        estado: 'confirmado',
        fecha: '2026-10-05',
        whatsapp: 'enviado',
        respuesta: 'whatsapp',
      });
      await cita({ estado: 'sin_respuesta', fecha: '2026-10-05', whatsapp: 'enviado' });
      await cita({ estado: 'confirmado', fecha: '2026-10-06', respuesta: 'llamada' });
      await cita({ estado: 'enviado', fecha: '2026-10-06', whatsapp: 'fallido' });
      await cita({
        estado: 'confirmado',
        fecha: '2026-10-07',
        centro: 'B',
        whatsapp: 'enviado',
        respuesta: 'whatsapp',
      });
    });

    it('agrupa confirmaciones por centro y calcula la proporción de confirmadas', async () => {
      const r = await http()
        .get(`/api/reportes/resumen?desde=2026-10-01&hasta=2026-10-31&centro=${CA}`)
        .set('Authorization', await encargado())
        .expect(200);
      expect(r.body.confirmaciones.porCentro).toHaveLength(1);
      expect(r.body.confirmaciones.total).toMatchObject({
        total: 4,
        confirmado: 2,
        sin_respuesta: 1,
        enviado: 1,
      });
      expect(r.body.piloto.proporcionConfirmadas).toBe(50);
    });

    it('mide la respuesta por WhatsApp solo sobre mensajes que salieron (no fallidos)', async () => {
      const r = await http()
        .get(`/api/reportes/resumen?desde=2026-10-01&hasta=2026-10-31&centro=${CA}`)
        .set('Authorization', await encargado())
        .expect(200);
      expect(r.body.piloto.citasConWhatsapp).toBe(2);
      expect(r.body.piloto.respondidasPorWhatsapp).toBe(1);
      expect(r.body.piloto.tasaRespuestaWhatsapp).toBe(50);
      expect(r.body.piloto.llamadasEvitadas).toBe(1);
    });

    it('cuenta motivos, edad × sexo al momento de la llamada y tiempos de registro', async () => {
      const r = await http()
        .get(`/api/reportes/resumen?desde=2026-11-10&hasta=2026-11-12&centro=${CA}`)
        .set('Authorization', await encargado())
        .expect(200);
      expect(r.body.motivos.total).toBe(3);
      expect(r.body.motivos.filas[0]).toMatchObject({ llamadas: 2 });
      const filas: { tramo: string; M: number; F: number; total: number }[] = r.body.edadSexo.filas;
      expect(filas.reduce((s, f) => s + f.total, 0)).toBe(2);
      expect(filas.reduce((s, f) => s + f.F, 0)).toBe(1);
      expect(filas.reduce((s, f) => s + f.M, 0)).toBe(1);
      expect(r.body.edadSexo.sinPacienteIdentificado).toBe(1);
      expect(r.body.piloto.llamadasEntrantes).toBe(3);
      expect(r.body.piloto.tiempoRegistroEntrante).toMatchObject({ registros: 3, promedio: 30 });
    });

    it('los límites del rango siguen el día chileno', async () => {
      // 2026-10-31T15:00Z es 12:00 del 31 en Chile: cae en octubre, no en noviembre
      const oct = await http()
        .get(`/api/reportes/resumen?desde=2026-10-01&hasta=2026-10-31&centro=${CA}`)
        .set('Authorization', await encargado())
        .expect(200);
      expect(oct.body.piloto.llamadasEntrantes).toBe(1);
    });

    it('rechaza rangos invertidos o de más de 366 días', async () => {
      const a = await encargado();
      await http()
        .get('/api/reportes/resumen?desde=2026-11-30&hasta=2026-11-01')
        .set('Authorization', a)
        .expect(400);
      await http()
        .get('/api/reportes/resumen?desde=2024-01-01&hasta=2026-01-01')
        .set('Authorization', a)
        .expect(400);
      await http()
        .get('/api/reportes/resumen?desde=2026-11-01')
        .set('Authorization', a)
        .expect(400);
    });

    it('la funcionaria no accede a los reportes (módulo restringido)', async () => {
      await http()
        .get('/api/reportes/resumen?desde=2026-10-01&hasta=2026-10-31')
        .set('Authorization', await funcA())
        .expect(403);
    });
  });

  // ================================================================================== exportación

  describe('exportar', () => {
    it('entrega un .xlsx con solo cifras agregadas, neutraliza fórmulas y audita la descarga', async () => {
      const res = await http()
        .get(`/api/reportes/exportar?desde=2026-10-01&hasta=2026-10-31&centro=${CA}`)
        .set('Authorization', await admin())
        .buffer(true)
        .parse(binario)
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain(
        'reporte-contactabilidad_2026-10-01_2026-10-31.xlsx',
      );
      const libro = XLSX.read(res.body as Buffer, { type: 'buffer' });
      expect(libro.SheetNames).toEqual([
        'Resumen',
        'Confirmaciones por centro',
        'Motivos de llamada',
        'Edad y sexo',
      ]);
      const celdas = libro.SheetNames.flatMap((s) =>
        XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[s]!, { header: 1 }).flat(),
      ).map(String);
      // ningún dato personal
      expect(celdas.join('|')).not.toMatch(/Paciente Reporte|\+569\d{8}|\d{7,8}-[\dK]/);
      // el nombre del centro empieza con «=»: debe quedar como texto
      expect(celdas.some((c) => c.startsWith('='))).toBe(false);
      expect(celdas.some((c) => c.includes(`Centro A ${sufijo}`))).toBe(true);

      const evento = await prisma.auditEvent.findFirst({
        where: { accion: 'reporte.exportar', centroId: centroA.id },
        orderBy: { ocurrioEn: 'desc' },
      });
      expect(evento).not.toBeNull();
      expect(evento!.detalle).toMatchObject({
        desde: '2026-10-01',
        hasta: '2026-10-31',
        centro: CA,
      });
    });

    it('la funcionaria no puede exportar, y no queda auditoría de una descarga que no ocurrió', async () => {
      const antes = await prisma.auditEvent.count({ where: { accion: 'reporte.exportar' } });
      await http()
        .get('/api/reportes/exportar?desde=2026-10-01&hasta=2026-10-31')
        .set('Authorization', await funcA())
        .expect(403);
      expect(await prisma.auditEvent.count({ where: { accion: 'reporte.exportar' } })).toBe(antes);
    });
  });
});
