import type { INestApplication } from '@nestjs/common';
import { SignJWT, generateKeyPair } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarConfig } from './config';
import { AUDIENCE, claims, crearAppDePrueba, ids, ISSUER } from './pruebas/ayudas';

describe('API: autenticación y autorización', () => {
  let app: INestApplication;
  let emitir: Awaited<ReturnType<typeof crearAppDePrueba>>['emitir'];
  let auditoria: Record<string, unknown>[];
  let motivos: { activo: boolean; descripcion: string }[];
  const http = () => request(app.getHttpServer());
  const bearer = async (c: Parameters<typeof emitir>[0]) => `Bearer ${await emitir(c)}`;

  beforeAll(async () => {
    ({ app, emitir, auditoria, motivos } = await crearAppDePrueba());
  });
  afterAll(() => app.close());

  describe('rutas públicas', () => {
    it('/health responde sin token y sin datos sensibles', async () => {
      const res = await http().get('/health').expect(200);
      expect(res.body.estado).toBe('ok');
      expect(JSON.stringify(res.body)).not.toMatch(/password|secret|token/i);
    });
    it('/fhir/R4/metadata es público y declara FHIR 4.0.1 con tipo fhir+json', async () => {
      const res = await http().get('/fhir/R4/metadata').expect(200);
      expect(res.body.fhirVersion).toBe('4.0.1');
      expect(res.headers['content-type']).toContain('application/fhir+json');
    });
    it('envía cabeceras de seguridad y oculta x-powered-by', async () => {
      const res = await http().get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('401: token ausente o inválido', () => {
    it('sin token', async () => {
      await http().get('/api/me').expect(401);
    });
    it('esquema distinto de Bearer', async () => {
      await http().get('/api/me').set('Authorization', 'Basic abc').expect(401);
    });
    it('token basura', async () => {
      await http().get('/api/me').set('Authorization', 'Bearer no.es.jwt').expect(401);
    });
    it('audiencia equivocada', async () => {
      const t = await emitir(claims.funcionaria, { audience: 'otra-api' });
      await http().get('/api/me').set('Authorization', `Bearer ${t}`).expect(401);
    });
    it('emisor equivocado', async () => {
      const t = await emitir(claims.funcionaria, { issuer: 'http://evil/realms/x' });
      await http().get('/api/me').set('Authorization', `Bearer ${t}`).expect(401);
    });
    it('token expirado', async () => {
      const t = await emitir(claims.funcionaria, { expira: '-1m' });
      await http().get('/api/me').set('Authorization', `Bearer ${t}`).expect(401);
    });
    it('firmado con otra clave (falsificado)', async () => {
      const { privateKey } = await generateKeyPair('RS256');
      const falso = await new SignJWT(claims.admin)
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setExpirationTime('5m')
        .sign(privateKey);
      await http().get('/api/me').set('Authorization', `Bearer ${falso}`).expect(401);
    });
    it('alg=none no se acepta', async () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const t = `${b64({ alg: 'none' })}.${b64({ ...claims.admin, iss: ISSUER, aud: AUDIENCE })}.`;
      await http().get('/api/me').set('Authorization', `Bearer ${t}`).expect(401);
    });
  });

  describe('403: autenticado pero sin permiso', () => {
    it('token válido sin rol del sistema', async () => {
      await http()
        .get('/api/me')
        .set('Authorization', await bearer(claims.sinRol))
        .expect(403);
    });
    it('funcionaria sin centro asignado', async () => {
      await http()
        .get('/api/me')
        .set('Authorization', await bearer(claims.funcionariaSinCentro))
        .expect(403);
    });
  });

  describe('GET /api/me', () => {
    it('funcionaria: ve su centro y no tiene reportes ni configuración; queda auditado', async () => {
      const antes = auditoria.length;
      const res = await http()
        .get('/api/me')
        .set('Authorization', await bearer(claims.funcionaria))
        .expect(200);
      expect(res.body.rol).toBe('funcionaria');
      expect(res.body.centro.codigo).toBe('CSC');
      expect(res.body.modulos).toContain('pendientes');
      expect(res.body.modulos).not.toContain('reportes');
      expect(res.body.modulos).not.toContain('configuracion');
      expect(auditoria.length).toBe(antes + 1);
      expect(auditoria.at(-1)).toMatchObject({
        accion: 'sesion.ingreso',
        usuarioId: ids.userFuncionaria,
      });
    });
    it('administrador ve todos los módulos y no tiene centro', async () => {
      const res = await http()
        .get('/api/me')
        .set('Authorization', await bearer(claims.admin))
        .expect(200);
      expect(res.body.modulos).toContain('configuracion');
      expect(res.body.centro).toBeNull();
    });
  });

  describe('alcance por centro', () => {
    it('funcionaria solo ve su centro', async () => {
      const res = await http()
        .get('/api/centros')
        .set('Authorization', await bearer(claims.funcionaria))
        .expect(200);
      expect(res.body.map((c: { codigo: string }) => c.codigo)).toEqual(['CSC']);
    });
    it('encargado ve todos los centros', async () => {
      const res = await http()
        .get('/api/centros')
        .set('Authorization', await bearer(claims.encargado))
        .expect(200);
      expect(res.body).toHaveLength(2);
    });
    it('funcionaria que pide profesionales de otro centro recibe 403 (no un filtro silencioso)', async () => {
      await http()
        .get('/api/profesionales?centro=CSN')
        .set('Authorization', await bearer(claims.funcionaria))
        .expect(403);
    });
    it('funcionaria ve profesionales de su centro', async () => {
      const res = await http()
        .get('/api/profesionales')
        .set('Authorization', await bearer(claims.funcionaria))
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].nombre).toBe('Dra. Demo Uno');
    });
  });

  describe('administración de motivos (solo administrador)', () => {
    const url = `/api/config/motivos/${ids.motivo1}`;
    it.each([
      ['funcionaria', claims.funcionaria],
      ['encargado', claims.encargado],
    ])('%s recibe 403 y queda registrado el acceso denegado', async (_n, c) => {
      const antes = auditoria.length;
      await http()
        .patch(url)
        .set('Authorization', await bearer(c))
        .send({ activo: false })
        .expect(403);
      expect(auditoria.length).toBe(antes + 1);
      expect(auditoria.at(-1)).toMatchObject({
        accion: 'acceso.denegado',
        recurso: 'modulo:configuracion',
      });
      expect(motivos[0]?.activo).toBe(true);
    });
    it('administrador actualiza y queda auditado con el detalle', async () => {
      const res = await http()
        .patch(url)
        .set('Authorization', await bearer(claims.admin))
        .send({ descripcion: 'Solicitud de hora médica' })
        .expect(200);
      expect(res.body.descripcion).toBe('Solicitud de hora médica');
      expect(auditoria.at(-1)).toMatchObject({
        accion: 'motivo.actualizar',
        recursoId: ids.motivo1,
        usuarioId: ids.userAdmin,
      });
    });
    it('rechaza cuerpo vacío, campos desconocidos e id no UUID', async () => {
      const h = await bearer(claims.admin);
      await http().patch(url).set('Authorization', h).send({}).expect(400);
      await http().patch(url).set('Authorization', h).send({ activo: true, rol: 'x' }).expect(400);
      await http()
        .patch('/api/config/motivos/no-uuid')
        .set('Authorization', h)
        .send({ activo: true })
        .expect(400);
    });
    it('404 si el motivo no existe', async () => {
      await http()
        .patch('/api/config/motivos/00000000-0000-4000-8000-0000000000ff')
        .set('Authorization', await bearer(claims.admin))
        .send({ activo: false })
        .expect(404);
    });
  });

  describe('fachada FHIR', () => {
    it('funcionaria: Organization devuelve solo su centro, como Bundle searchset', async () => {
      const res = await http()
        .get('/fhir/R4/Organization')
        .set('Authorization', await bearer(claims.funcionaria))
        .expect(200);
      expect(res.headers['content-type']).toContain('application/fhir+json');
      expect(res.body.resourceType).toBe('Bundle');
      expect(res.body.total).toBe(1);
      expect(res.body.entry[0].resource.identifier[0].value).toBe('CSC');
    });
    it('funcionaria no puede leer un centro ajeno: 404 con OperationOutcome', async () => {
      const res = await http()
        .get(`/fhir/R4/Organization/${ids.centroCSN}`)
        .set('Authorization', await bearer(claims.funcionaria))
        .expect(404);
      expect(res.body.resourceType).toBe('OperationOutcome');
    });
    it('encargado lee cualquier centro y Location apunta a su Organization', async () => {
      const res = await http()
        .get(`/fhir/R4/Location/${ids.centroCSN}`)
        .set('Authorization', await bearer(claims.encargado))
        .expect(200);
      expect(res.body.managingOrganization.reference).toBe(`Organization/${ids.centroCSN}`);
    });
    it('CodeSystem de resultado de llamada y de motivos', async () => {
      const h = await bearer(claims.funcionaria);
      const r1 = await http()
        .get('/fhir/R4/CodeSystem/resultado-llamada')
        .set('Authorization', h)
        .expect(200);
      expect(r1.body.concept.map((c: { code: string }) => c.code)).toContain('no_ubicado');
      const r2 = await http()
        .get('/fhir/R4/CodeSystem/motivo-llamada')
        .set('Authorization', h)
        .expect(200);
      expect(r2.body.count).toBe(1);
      await http().get('/fhir/R4/CodeSystem/inexistente').set('Authorization', h).expect(404);
    });
    it('exige token (excepto /metadata)', async () => {
      await http().get('/fhir/R4/Organization').expect(401);
    });
  });

  describe('CORS', () => {
    it('permite el origen de la web y bloquea otros', async () => {
      const ok = await http().get('/health').set('Origin', 'http://localhost:5173');
      expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      const mal = await http().get('/health').set('Origin', 'http://evil.example');
      expect(mal.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

describe('cargarConfig', () => {
  it('usa DEMO por defecto y rechaza valores inválidos', () => {
    expect(cargarConfig({}).ambiente).toBe('DEMO');
    expect(() => cargarConfig({ AMBIENTE: 'PROD' })).toThrow(/AMBIENTE inválido/);
    expect(() => cargarConfig({ API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
  it('en PRODUCCION exige https en el emisor de Keycloak', () => {
    expect(() =>
      cargarConfig({ AMBIENTE: 'PRODUCCION', KEYCLOAK_ISSUER: 'http://kc/realms/x' }),
    ).toThrow(/https/);
    expect(
      cargarConfig({ AMBIENTE: 'PRODUCCION', KEYCLOAK_ISSUER: 'https://kc/realms/x' }).keycloak
        .issuer,
    ).toBe('https://kc/realms/x');
  });
  it('deriva el JWKS del emisor salvo que se indique otro', () => {
    expect(cargarConfig({}).keycloak.jwksUrl).toMatch(/\/protocol\/openid-connect\/certs$/);
    expect(cargarConfig({ KEYCLOAK_JWKS_URL: 'http://kc:8080/certs' }).keycloak.jwksUrl).toBe(
      'http://kc:8080/certs',
    );
  });
});
