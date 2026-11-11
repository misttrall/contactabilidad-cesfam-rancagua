import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarConfig, type Config } from '../config';
import { crearAppDePrueba } from '../pruebas/ayudas';
import { limitarTasa } from './limite-tasa';
import { LimiteUsuarioGuard } from './limite-usuario.guard';

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
    expect(api.headers['ratelimit-limit']).toBe('3000'); // por IP antes de autenticar
  });
});

describe('LimiteUsuarioGuard (límites por usuario, no por IP)', () => {
  const config = (limitesTasa = true) => ({ limitesTasa }) as Config;
  const ctx = (sub: string | null, metodo: string, ruta: string, ip = '10.0.0.1') => {
    const cab: Record<string, string> = {};
    const req = { method: metodo, path: ruta, ip, ...(sub ? { sesion: { id: sub } } : {}) };
    const res = { setHeader: (k: string, v: string) => void (cab[k] = v) };
    return {
      cab,
      c: { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as never,
    };
  };
  const intentar = (g: LimiteUsuarioGuard, c: never) => {
    try {
      return g.canActivate(c);
    } catch (e) {
      return (e as { getStatus(): number }).getStatus();
    }
  };

  it('dos funcionarias con la MISMA IP no comparten cupo', () => {
    const g = new LimiteUsuarioGuard(config());
    for (let i = 0; i < 60; i++)
      expect(intentar(g, ctx('ana', 'POST', '/api/pacientes/1/revelar').c)).toBe(true);
    expect(intentar(g, ctx('ana', 'POST', '/api/pacientes/1/revelar').c)).toBe(429);
    // misma IP, otra persona: sigue pudiendo trabajar
    expect(intentar(g, ctx('beto', 'POST', '/api/pacientes/1/revelar').c)).toBe(true);
  });

  it('cargas: 10 por minuto por usuario; consultar no consume ese cupo', () => {
    const g = new LimiteUsuarioGuard(config());
    for (let i = 0; i < 10; i++)
      expect(intentar(g, ctx('ana', 'POST', '/api/cargas').c)).toBe(true);
    expect(intentar(g, ctx('ana', 'POST', '/api/cargas').c)).toBe(429);
    expect(intentar(g, ctx('ana', 'GET', '/api/cargas').c)).toBe(true);
  });

  it('previsualizar un envío no cuenta como crear un envío', () => {
    const g = new LimiteUsuarioGuard(config());
    for (let i = 0; i < 30; i++) {
      expect(intentar(g, ctx('ana', 'POST', '/api/envios/previsualizar').c)).toBe(true);
    }
  });

  it('sin sesión (ruta pública) no cuenta; sin límites activos tampoco', () => {
    const g = new LimiteUsuarioGuard(config());
    for (let i = 0; i < 700; i++) expect(intentar(g, ctx(null, 'GET', '/health').c)).toBe(true);
    const apagado = new LimiteUsuarioGuard(config(false));
    for (let i = 0; i < 700; i++)
      expect(intentar(apagado, ctx('ana', 'GET', '/api/me').c)).toBe(true);
  });

  it('informa los encabezados RateLimit y Retry-After al rechazar', () => {
    const g = new LimiteUsuarioGuard(config());
    let ultima = ctx('ana', 'POST', '/api/cargas');
    for (let i = 0; i < 11; i++) {
      ultima = ctx('ana', 'POST', '/api/cargas');
      intentar(g, ultima.c);
    }
    expect(ultima.cab['Retry-After']).toBeDefined();
    expect(ultima.cab['RateLimit-Remaining']).toBe('0');
  });
});

describe('TRUST_PROXY', () => {
  it('es un entero de 0 a 10; valores como "true" fallan al arrancar', () => {
    expect(cargarConfig({}).trustProxy).toBe(0);
    expect(cargarConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(() => cargarConfig({ TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(() => cargarConfig({ TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
  });
});
