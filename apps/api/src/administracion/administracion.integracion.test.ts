/**
 * Configuración (centros, motivos, plantillas, usuarios), bloqueo de usuarios desactivados y
 * «restablecer datos demo», contra PostgreSQL REAL. Keycloak va simulado en memoria.
 * Se omite sin TEST_DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Rol } from '@bh/shared';
import { AppModule } from '../app.module';
import { configurarApp } from '../app';
import { CifradoService } from '../cifrado/cifrado.service';
import { PrismaService } from '../prisma/prisma.service';
import { crearEmisor } from '../pruebas/ayudas';
import { VERIFICADOR_TOKEN } from '../tokens';
import { KeycloakAdminService, type UsuarioKeycloak } from '../usuarios/keycloak-admin.service';

const URL_PRUEBAS = process.env.TEST_DATABASE_URL;
if (URL_PRUEBAS) process.env.DATABASE_URL = URL_PRUEBAS;
// Celulares de prueba del equipo: los primeros pacientes ficticios los reciben (ver docs/mvp/WHATSAPP.md).
const TELEFONOS_EQUIPO = ['+56911112222', '+56933334444'];
process.env.DEMO_TELEFONOS_PRUEBA = TELEFONOS_EQUIPO.join(',');

/** Keycloak en memoria con la misma interfaz que el servicio real. */
class KeycloakFalso {
  habilitado = true;
  usuarios = new Map<string, UsuarioKeycloak>();
  llamadas: { id: string; cambios: unknown }[] = [];
  listar() {
    return Promise.resolve([...this.usuarios.values()]);
  }
  obtener(id: string) {
    const u = this.usuarios.get(id);
    return u
      ? Promise.resolve({ ...u })
      : Promise.reject(new NotFoundException('Usuario no encontrado'));
  }
  actualizar(id: string, c: { rol?: Rol; centro?: string | null; activo?: boolean }) {
    this.llamadas.push({ id, cambios: c });
    const u = this.usuarios.get(id)!;
    if (c.rol) u.rol = c.rol;
    if (c.centro !== undefined) u.centro = c.centro;
    if (c.activo !== undefined) u.activo = c.activo;
    return Promise.resolve({ ...u });
  }
}

describe.skipIf(!URL_PRUEBAS)('Administración (PostgreSQL real)', () => {
  const sufijo = randomUUID().slice(0, 6).toUpperCase();
  const CA = `AA${sufijo}`;
  const subAdmin = randomUUID();
  const subFunc = randomUUID();
  const kc = new KeycloakFalso();
  let app: INestApplication;
  let prisma: PrismaService;
  let emitir: Awaited<ReturnType<typeof crearEmisor>>['emitir'];
  const http = () => request(app.getHttpServer());
  const tok = async (c: Record<string, unknown>) =>
    `Bearer ${await emitir({ name: 'Usuario Prueba', ...c })}`;
  const admin = () => tok({ sub: subAdmin, realm_access: { roles: ['administrador'] } });
  const encargado = () => tok({ sub: randomUUID(), realm_access: { roles: ['encargado'] } });
  const funcionaria = () =>
    tok({ sub: subFunc, realm_access: { roles: ['funcionaria'] }, centro_id: CA });
  const creados: string[] = [];

  beforeAll(async () => {
    const { verificador, emitir: e } = await crearEmisor();
    emitir = e;
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VERIFICADOR_TOKEN)
      .useValue(verificador)
      .overrideProvider(KeycloakAdminService)
      .useValue(kc)
      .compile();
    app = configurarApp(modulo.createNestApplication({ rawBody: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.centro.create({ data: { codigo: CA, nombre: `Centro Admin ${sufijo}` } });
    kc.usuarios.set(subAdmin, {
      id: subAdmin,
      username: 'admin.test',
      nombre: 'Admin Test',
      activo: true,
      rol: 'administrador',
      centro: null,
    });
    kc.usuarios.set(subFunc, {
      id: subFunc,
      username: 'func.test',
      nombre: 'Func Test',
      activo: true,
      rol: 'funcionaria',
      centro: CA,
    });
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { keycloakId: { in: [subAdmin, subFunc] } } });
    // lo que dejó «restablecer demo» (citas sembradas) debe irse antes que el centro
    await app
      .get(PrismaService)
      .$transaction([
        prisma.llamadaEntrante.deleteMany(),
        prisma.cita.deleteMany(),
        prisma.envio.deleteMany(),
        prisma.consentimiento.deleteMany(),
        prisma.paciente.deleteMany(),
        prisma.carga.deleteMany(),
      ]);
    await prisma.profesional.deleteMany({
      where: { centro: { codigo: { in: [CA, ...creados] } } },
    });
    await prisma.centro.deleteMany({ where: { codigo: { in: [CA, ...creados] } } });
    await prisma.motivoLlamada.deleteMany({ where: { codigo: { contains: sufijo } } });
    await app.close();
  });

  it('solo el administrador entra a la configuración', async () => {
    await http()
      .get('/api/config/centros')
      .set('Authorization', await funcionaria())
      .expect(403);
    await http()
      .get('/api/config/centros')
      .set('Authorization', await encargado())
      .expect(403);
    await http()
      .get('/api/config/centros')
      .set('Authorization', await admin())
      .expect(200);
  });

  describe('centros', () => {
    it('crea un centro (código en mayúsculas), audita y rechaza duplicados', async () => {
      const cod = `Z${sufijo}`;
      creados.push(cod);
      const r = await http()
        .post('/api/config/centros')
        .set('Authorization', await admin())
        .send({ codigo: cod.toLowerCase(), nombre: `Centro Nuevo ${sufijo}` })
        .expect(201);
      expect(r.body).toMatchObject({ codigo: cod, activo: true });
      expect(
        await prisma.auditEvent.count({ where: { accion: 'centro.crear', recursoId: r.body.id } }),
      ).toBe(1);
      await http()
        .post('/api/config/centros')
        .set('Authorization', await admin())
        .send({ codigo: cod, nombre: 'Otro nombre' })
        .expect(409);
    });

    it('valida el código y el nombre', async () => {
      const a = await admin();
      await http()
        .post('/api/config/centros')
        .set('Authorization', a)
        .send({ codigo: 'a', nombre: 'Centro' })
        .expect(400);
      await http()
        .post('/api/config/centros')
        .set('Authorization', a)
        .send({ codigo: 'OKOK', nombre: 'x' })
        .expect(400);
      await http()
        .post('/api/config/centros')
        .set('Authorization', a)
        .send({ codigo: 'OKOK', nombre: 'Centro', extra: 1 })
        .expect(400);
    });

    it('edita nombre y activación; un id inexistente da 404', async () => {
      const c = await prisma.centro.findUniqueOrThrow({ where: { codigo: CA } });
      const a = await admin();
      const r = await http()
        .patch(`/api/config/centros/${c.id}`)
        .set('Authorization', a)
        .send({ nombre: `Centro Editado ${sufijo}`, activo: false })
        .expect(200);
      expect(r.body).toMatchObject({ nombre: `Centro Editado ${sufijo}`, activo: false });
      await http()
        .patch(`/api/config/centros/${c.id}`)
        .set('Authorization', a)
        .send({ activo: true })
        .expect(200);
      await http()
        .patch(`/api/config/centros/${randomUUID()}`)
        .set('Authorization', a)
        .send({ activo: true })
        .expect(404);
      await http()
        .patch('/api/config/centros/no-es-uuid')
        .set('Authorization', a)
        .send({ activo: true })
        .expect(404);
      await http()
        .patch(`/api/config/centros/${c.id}`)
        .set('Authorization', a)
        .send({})
        .expect(400);
    });
  });

  describe('teléfono de contacto del centro', () => {
    it('se guarda, se normaliza (vacío = sin teléfono), se valida y queda auditado', async () => {
      const c = await prisma.centro.findUniqueOrThrow({ where: { codigo: CA } });
      const a = await admin();
      const url = `/api/config/centros/${c.id}`;
      const ok = await http()
        .patch(url)
        .set('Authorization', a)
        .send({ telefonoContacto: '  +56 72 255 0000 ' })
        .expect(200);
      expect(ok.body.telefonoContacto).toBe('+56 72 255 0000');
      await http()
        .patch(url)
        .set('Authorization', a)
        .send({ telefonoContacto: 'llámame' })
        .expect(400);
      await http().patch(url).set('Authorization', a).send({ telefonoContacto: '123' }).expect(400);
      const vacio = await http()
        .patch(url)
        .set('Authorization', a)
        .send({ telefonoContacto: '' })
        .expect(200);
      expect(vacio.body.telefonoContacto).toBeNull();
      const lista = await http().get('/api/config/centros').set('Authorization', a).expect(200);
      expect(lista.body.find((x: { id: string }) => x.id === c.id)).toHaveProperty(
        'telefonoContacto',
        null,
      );
      const ev = await prisma.auditEvent.findFirst({
        where: { accion: 'centro.actualizar', recursoId: c.id },
        orderBy: { ocurrioEn: 'desc' },
      });
      expect(ev).not.toBeNull();
    });
  });

  describe('motivos', () => {
    it('crea al final de la lista, rechaza duplicados y permite reordenar', async () => {
      const a = await admin();
      const m1 = await http()
        .post('/api/config/motivos')
        .set('Authorization', a)
        .send({ codigo: `M1_${sufijo}`, descripcion: 'Motivo uno' })
        .expect(201);
      const m2 = await http()
        .post('/api/config/motivos')
        .set('Authorization', a)
        .send({ codigo: `M2_${sufijo}`, descripcion: 'Motivo dos' })
        .expect(201);
      expect(m2.body.orden).toBeGreaterThan(m1.body.orden);
      await http()
        .post('/api/config/motivos')
        .set('Authorization', a)
        .send({ codigo: `M1_${sufijo}`, descripcion: 'Repetido' })
        .expect(409);

      const subir = await http()
        .post(`/api/config/motivos/${m2.body.id}/mover`)
        .set('Authorization', a)
        .send({ direccion: 'arriba' })
        .expect(201);
      const orden: string[] = subir.body.map((m: { codigo: string }) => m.codigo);
      expect(orden.indexOf(`M2_${sufijo}`)).toBeLessThan(orden.indexOf(`M1_${sufijo}`));
      // el orden queda consecutivo, sin repetidos
      const nums: number[] = subir.body.map((m: { orden: number }) => m.orden);
      expect(nums).toEqual(nums.map((_, i) => i));

      // mover el primero hacia arriba no cambia nada ni falla
      const primero = subir.body[0].id;
      await http()
        .post(`/api/config/motivos/${primero}/mover`)
        .set('Authorization', a)
        .send({ direccion: 'arriba' })
        .expect(201);
      await http()
        .post(`/api/config/motivos/${randomUUID()}/mover`)
        .set('Authorization', a)
        .send({ direccion: 'abajo' })
        .expect(404);
      await http()
        .post(`/api/config/motivos/${primero}/mover`)
        .set('Authorization', a)
        .send({ direccion: 'diagonal' })
        .expect(400);
    });
  });

  describe('plantillas', () => {
    it('muestra las plantillas de solo lectura con la nota de aprobación en Meta', async () => {
      const r = await http()
        .get('/api/config/plantillas')
        .set('Authorization', await admin())
        .expect(200);
      expect(r.body.plantillas.map((p: { clave: string }) => p.clave)).toEqual([
        'confirmacion',
        'recordatorio',
      ]);
      expect(r.body.nota).toMatch(/Meta/);
      // el texto de ejemplo no debe llevar datos de un paciente real
      expect(JSON.stringify(r.body)).not.toMatch(/\d{7,8}-[\dK]/);
    });
  });

  describe('usuarios', () => {
    it('lista usuarios y marca al propio; sin credenciales de Keycloak informa que no está habilitado', async () => {
      const r = await http()
        .get('/api/config/usuarios')
        .set('Authorization', await admin())
        .expect(200);
      expect(r.body.habilitado).toBe(true);
      expect(r.body.usuarios.find((u: { id: string }) => u.id === subAdmin).esYo).toBe(true);

      kc.habilitado = false;
      const sin = await http()
        .get('/api/config/usuarios')
        .set('Authorization', await admin())
        .expect(200);
      expect(sin.body).toEqual({ habilitado: false, usuarios: [] });
      await http()
        .patch(`/api/config/usuarios/${subFunc}`)
        .set('Authorization', await admin())
        .send({ activo: false })
        .expect(400);
      kc.habilitado = true;
    });

    it('nadie se quita su propio acceso de administrador ni se desactiva', async () => {
      const a = await admin();
      await http()
        .patch(`/api/config/usuarios/${subAdmin}`)
        .set('Authorization', a)
        .send({ activo: false })
        .expect(400);
      await http()
        .patch(`/api/config/usuarios/${subAdmin}`)
        .set('Authorization', a)
        .send({ rol: 'encargado' })
        .expect(400);
      expect(kc.usuarios.get(subAdmin)!.activo).toBe(true);
    });

    it('la funcionaria exige un centro activo; pasar a encargado le quita el centro', async () => {
      const a = await admin();
      await http()
        .patch(`/api/config/usuarios/${subFunc}`)
        .set('Authorization', a)
        .send({ centro: null })
        .expect(400);
      await http()
        .patch(`/api/config/usuarios/${subFunc}`)
        .set('Authorization', a)
        .send({ centro: 'NOEXISTE' })
        .expect(400);
      const r = await http()
        .patch(`/api/config/usuarios/${subFunc}`)
        .set('Authorization', a)
        .send({ rol: 'encargado' })
        .expect(200);
      expect(r.body).toMatchObject({ rol: 'encargado', centro: null });
      // volver a funcionaria sin indicar centro: no hay centro → rechazo
      await http()
        .patch(`/api/config/usuarios/${subFunc}`)
        .set('Authorization', a)
        .send({ rol: 'funcionaria' })
        .expect(400);
      await http()
        .patch(`/api/config/usuarios/${subFunc}`)
        .set('Authorization', a)
        .send({ rol: 'funcionaria', centro: CA })
        .expect(200);
      expect(kc.usuarios.get(subFunc)).toMatchObject({ rol: 'funcionaria', centro: CA });
    });

    it('rechaza datos inválidos y usuarios inexistentes', async () => {
      const a = await admin();
      await http()
        .patch(`/api/config/usuarios/${subFunc}`)
        .set('Authorization', a)
        .send({ rol: 'superusuario' })
        .expect(400);
      await http()
        .patch(`/api/config/usuarios/${subFunc}`)
        .set('Authorization', a)
        .send({})
        .expect(400);
      await http()
        .patch(`/api/config/usuarios/${randomUUID()}`)
        .set('Authorization', a)
        .send({ activo: false })
        .expect(404);
    });

    it('desactivar a un usuario lo bloquea de inmediato (aunque su token siga vigente) y audita sin datos personales', async () => {
      // primer ingreso: crea el espejo local y queda en la caché como activo
      await http()
        .get('/api/me')
        .set('Authorization', await funcionaria())
        .expect(200);
      await http()
        .get('/api/dashboard')
        .set('Authorization', await funcionaria())
        .expect(200);
      await http()
        .patch(`/api/config/usuarios/${subFunc}`)
        .set('Authorization', await admin())
        .send({ activo: false })
        .expect(200);
      const bloqueada = await http()
        .get('/api/dashboard')
        .set('Authorization', await funcionaria())
        .expect(403);
      expect(bloqueada.body.message).toMatch(/desactivado/);

      await http()
        .patch(`/api/config/usuarios/${subFunc}`)
        .set('Authorization', await admin())
        .send({ activo: true })
        .expect(200);
      await http()
        .get('/api/dashboard')
        .set('Authorization', await funcionaria())
        .expect(200);

      const eventos = await prisma.auditEvent.findMany({
        where: { accion: 'usuario.actualizar', recursoId: subFunc },
      });
      expect(eventos.length).toBeGreaterThan(0);
      expect(JSON.stringify(eventos.map((e) => e.detalle))).not.toMatch(/func\.test|@/);
    });
  });

  describe('restablecer datos demo', () => {
    it('informa que está disponible en el ambiente DEMO', async () => {
      const r = await http()
        .get('/api/config/demo')
        .set('Authorization', await admin())
        .expect(200);
      expect(r.body).toEqual({ disponible: true });
    });

    it('exige escribir RESTABLECER', async () => {
      const a = await admin();
      await http()
        .post('/api/config/demo/restablecer')
        .set('Authorization', a)
        .send({})
        .expect(400);
      await http()
        .post('/api/config/demo/restablecer')
        .set('Authorization', a)
        .send({ confirmacion: 'si' })
        .expect(400);
    });

    it('borra los datos operativos, siembra citas ficticias por centro, conserva catálogo y auditoría', async () => {
      const centro = await prisma.centro.findUniqueOrThrow({ where: { codigo: CA } });
      const antesAuditoria = await prisma.auditEvent.count();
      const motivosAntes = await prisma.motivoLlamada.count();

      const r = await http()
        .post('/api/config/demo/restablecer')
        .set('Authorization', await admin())
        .send({ confirmacion: 'RESTABLECER', sembrar: true })
        .expect(201);
      expect(r.body.citasSembradas).toBeGreaterThanOrEqual(14);
      expect(await prisma.cita.count({ where: { centroId: centro.id } })).toBe(14);
      expect(
        await prisma.tareaContacto.count({
          where: { cita: { centroId: centro.id }, estado: 'sin_enviar' },
        }),
      ).toBe(14);
      // pacientes ficticios, nunca datos reales
      const p = await prisma.paciente.findFirstOrThrow({
        where: { citas: { some: { centroId: centro.id } } },
      });
      expect(p.nombre).toMatch(/^Paciente Demo/);

      // Los primeros pacientes llevan los celulares del equipo; el resto, números ficticios.
      const cifrado = app.get(CifradoService);
      const todos = await prisma.paciente.findMany({ orderBy: { nombre: 'asc' } });
      expect(todos.slice(0, 2).map((x) => cifrado.descifrar(x.telefonoCifrado!))).toEqual(
        TELEFONOS_EQUIPO,
      );
      expect(
        todos
          .slice(0, 2)
          .every(
            (x) => x.telefonoHash === cifrado.hashBusqueda(cifrado.descifrar(x.telefonoCifrado!)),
          ),
      ).toBe(true);
      expect(cifrado.descifrar(todos[2]!.telefonoCifrado!)).toMatch(/^\+569000/);

      expect(await prisma.motivoLlamada.count()).toBe(motivosAntes);
      expect(await prisma.auditEvent.count()).toBeGreaterThan(antesAuditoria); // la bitácora no se borra
      const ev = await prisma.auditEvent.findFirstOrThrow({
        where: { accion: 'demo.restablecer' },
        orderBy: { ocurrioEn: 'desc' },
      });
      expect(ev.detalle).toMatchObject({ sembradas: r.body.citasSembradas });

      // sin sembrar: queda todo vacío
      const vacio = await http()
        .post('/api/config/demo/restablecer')
        .set('Authorization', await admin())
        .send({ confirmacion: 'RESTABLECER', sembrar: false })
        .expect(201);
      expect(vacio.body.citasSembradas).toBe(0);
      expect(await prisma.cita.count()).toBe(0);
      expect(await prisma.paciente.count()).toBe(0);
    });

    it('la funcionaria y el encargado no pueden restablecer', async () => {
      await http()
        .post('/api/config/demo/restablecer')
        .set('Authorization', await funcionaria())
        .send({ confirmacion: 'RESTABLECER' })
        .expect(403);
      await http()
        .post('/api/config/demo/restablecer')
        .set('Authorization', await encargado())
        .send({ confirmacion: 'RESTABLECER' })
        .expect(403);
    });
  });
});
