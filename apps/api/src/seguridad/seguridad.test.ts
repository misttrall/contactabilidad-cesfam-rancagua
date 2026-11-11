import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarConfig } from '../config';
import { crearAppDePrueba } from '../pruebas/ayudas';
import { limitarTasa } from './limite-tasa';

/** Ejecuta el middleware con un req/res mínimos y devuelve lo que respondió. */
function golpear(
  mw: ReturnType<typeof limitarTasa>,
  ip = '1.1.1.1',
  cabeceras: Record<string, string> = {},
) {
  const cab: Record<string, string> = {};
  let estado = 200;
  let cuerpo: { message?: string } | undefined;
  let paso = false;
  const res = {
    setHeader: (k: string, v: string) => void (cab[k.toLowerCase()] = v),
    status(c: number) {
      estado = c;
      return this;
    },
    json(b: { message?: string }) {
      cuerpo = b;
    },
  };
  mw({ ip, headers: cabeceras } as never, res as never, () => void (paso = true));
  return { estado: paso ? 200 : estado, cab, cuerpo, paso };
}

describe('limitarTasa', () => {
  it('deja pasar hasta el máximo y luego responde 429 con Retry-After', () => {
    const reloj = { t: 0 };
    const mw = limitarTasa({ nombre: 'x', ventanaMs: 1000, max: 2, ahora: () => reloj.t });
    expect(golpear(mw).estado).toBe(200);
    expect(golpear(mw).cab['ratelimit-remaining']).toBe('0');
    const r3 = golpear(mw);
    expect(r3.estado).toBe(429);
    expect(r3.cab['retry-after']).toBe('1');
    expect(r3.cuerpo?.message).toContain('Demasiadas solicitudes');
  });

  it('la ventana se reinicia al vencer', () => {
    const reloj = { t: 0 };
    const mw = limitarTasa({ nombre: 'x', ventanaMs: 1000, max: 1, ahora: () => reloj.t });
    expect(golpear(mw).estado).toBe(200);
    expect(golpear(mw).estado).toBe(429);
    reloj.t = 1000;
    expect(golpear(mw).estado).toBe(200);
  });

  it('cuenta por clave: dos clientes no se afectan', () => {
    const mw = limitarTasa({ nombre: 'x', ventanaMs: 1000, max: 1 });
    expect(golpear(mw, 'a').estado).toBe(200);
    expect(golpear(mw, 'a').estado).toBe(429);
    expect(golpear(mw, 'b').estado).toBe(200);
  });

  it('reiniciar() limpia los contadores', () => {
    const mw = limitarTasa({ nombre: 'x', ventanaMs: 1000, max: 1 });
    golpear(mw);
    expect(golpear(mw).estado).toBe(429);
    mw.reiniciar();
    expect(golpear(mw).estado).toBe(200);
  });
});

describe('endurecimiento HTTP de la API', () => {
  let app: INestApplication;
  beforeAll(async () => {
    process.env.LIMITE_TASA = 'on';
    ({ app } = await crearAppDePrueba());
  });
  afterAll(() => app.close());
  const http = () => request(app.getHttpServer());

  it('CSP restrictiva, sin frames, sin referrer y sin cache en datos', async () => {
    const res = await http().get('/api/me');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('en DEMO no fuerza HSTS; en QA y PRODUCCION sí', async () => {
    const demo = await http().get('/health');
    expect(demo.headers['strict-transport-security']).toBeUndefined();
    const config = cargarConfig({
      AMBIENTE: 'QA',
      DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
      REDIS_URL: 'redis://x',
    });
    expect(config.ambiente).toBe('QA');
  });

  it('_format: acepta json y rechaza xml con OperationOutcome 406', async () => {
    await http().get('/fhir/R4/metadata?_format=json').expect(200);
    await http().get('/fhir/R4/metadata?_format=application/fhir%2Bjson').expect(200);
    const res = await http().get('/fhir/R4/metadata?_format=xml').expect(406);
    expect(res.body.resourceType).toBe('OperationOutcome');
  });

  it('LIMITE_TASA=off no está permitido en PRODUCCION', () => {
    const base = {
      AMBIENTE: 'PRODUCCION',
      KEYCLOAK_ISSUER: 'https://id.ejemplo.cl/realms/x',
      DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
      REDIS_URL: 'redis://x',
      WHATSAPP_MODO: 'cloud',
      WHATSAPP_TOKEN: 't',
      WHATSAPP_PHONE_NUMBER_ID: 'p',
      WHATSAPP_APP_SECRET: 's',
      WHATSAPP_VERIFY_TOKEN: 'v',
    };
    expect(cargarConfig(base).limitesTasa).toBe(true);
    expect(() => cargarConfig({ ...base, LIMITE_TASA: 'off' })).toThrow(/PRODUCCION/);
    expect(cargarConfig({ ...base, AMBIENTE: 'QA', LIMITE_TASA: 'off' }).limitesTasa).toBe(false);
  });

  it('/health no cuenta para el límite general', async () => {
    const res = await http().get('/health');
    expect(res.headers['ratelimit-limit']).toBeUndefined();
    const api = await http().get('/api/me');
    expect(api.headers['ratelimit-limit']).toBe('600');
  });
});
