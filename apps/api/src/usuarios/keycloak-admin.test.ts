import { BadGatewayException, NotFoundException, NotImplementedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Config } from '../config';
import { KeycloakAdminService } from './keycloak-admin.service';

const BASE = 'http://kc/admin/realms/x';
const config = (admin = true) =>
  ({
    keycloak: {
      issuer: 'http://kc/realms/x',
      admin: admin ? { clientId: 'adm', secret: 's3' } : undefined,
    },
  }) as Config;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

interface Llamada {
  url: string;
  metodo: string;
  cuerpo?: unknown;
  auth?: string;
}

function servicio(
  opciones: { expiraEn?: number; fallar?: (url: string) => Response | Error | null } = {},
) {
  const llamadas: Llamada[] = [];
  const svc = new KeycloakAdminService(config());
  svc.fetchFn = (async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const metodo = init.method ?? 'GET';
    let cuerpo: unknown;
    if (init.body) {
      cuerpo =
        typeof init.body === 'string'
          ? JSON.parse(init.body)
          : Object.fromEntries(init.body as URLSearchParams);
    }
    llamadas.push({
      url: u,
      metodo,
      ...(cuerpo !== undefined ? { cuerpo } : {}),
      auth: (init.headers as Record<string, string> | undefined)?.Authorization,
    });
    const falla = opciones.fallar?.(u);
    if (falla instanceof Error) throw falla;
    if (falla) return falla;
    if (u.endsWith('/protocol/openid-connect/token')) {
      return json({ access_token: 'TOKEN', expires_in: opciones.expiraEn ?? 300 });
    }
    if (u === `${BASE}/users?max=500`) {
      return json([
        { id: 'u2', username: 'zeta', firstName: 'Zoe', lastName: 'Vera', enabled: true },
        {
          id: 'u1',
          username: 'ana',
          firstName: 'Ana',
          lastName: 'Pérez',
          enabled: false,
          attributes: { centro_id: ['CSC'], otro: ['x'] },
        },
      ]);
    }
    if (u.includes('/roles/funcionaria/users')) return json([{ id: 'u1' }]);
    if (u.includes('/roles/encargado/users')) return json([{ id: 'u2' }]);
    if (u.includes('/roles/administrador/users')) return json([]);
    if (/\/roles\/(funcionaria|encargado|administrador)$/.test(u)) {
      const name = u.split('/').pop()!;
      return json({ id: `rol-${name}`, name });
    }
    if (u === `${BASE}/users/u1/role-mappings/realm` && metodo === 'GET') {
      return json([{ name: 'funcionaria' }, { name: 'offline_access' }]);
    }
    if (u === `${BASE}/users/u1` && metodo === 'GET') {
      return json({
        id: 'u1',
        username: 'ana',
        firstName: 'Ana',
        lastName: 'Pérez',
        enabled: false,
        attributes: { centro_id: ['CSC'], otro: ['x'] },
      });
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  return { svc, llamadas };
}

describe('KeycloakAdminService', () => {
  it('sin credenciales queda deshabilitado y no intenta nada', async () => {
    const svc = new KeycloakAdminService(config(false));
    expect(svc.habilitado).toBe(false);
    await expect(svc.listar()).rejects.toBeInstanceOf(NotImplementedException);
  });

  it('lista usuarios con rol y centro, ordenados; usa 3 consultas de rol (no una por usuario)', async () => {
    const { svc, llamadas } = servicio();
    const r = await svc.listar();
    expect(r.map((u) => [u.username, u.nombre, u.rol, u.centro, u.activo])).toEqual([
      ['ana', 'Ana Pérez', 'funcionaria', 'CSC', false],
      ['zeta', 'Zoe Vera', 'encargado', null, true],
    ]);
    expect(llamadas.filter((l) => /\/roles\/\w+\/users/.test(l.url))).toHaveLength(3);
    expect(
      llamadas.filter((l) => l.url.startsWith(BASE)).every((l) => l.auth === 'Bearer TOKEN'),
    ).toBe(true);
  });

  it('pide el token con client_credentials y lo reutiliza mientras no venza', async () => {
    const { svc, llamadas } = servicio();
    await svc.listar();
    await svc.listar();
    const tokens = llamadas.filter((l) => l.url.endsWith('/token'));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.cuerpo).toMatchObject({
      grant_type: 'client_credentials',
      client_id: 'adm',
      client_secret: 's3',
    });
  });

  it('renueva el token cuando está por vencer', async () => {
    const { svc, llamadas } = servicio({ expiraEn: 10 });
    await svc.listar();
    await svc.listar();
    expect(llamadas.filter((l) => l.url.endsWith('/token')).length).toBeGreaterThanOrEqual(2);
  });

  it('actualiza centro y activación conservando los demás atributos y cierra las sesiones', async () => {
    const { svc, llamadas } = servicio();
    await svc.actualizar('u1', { centro: 'CSN', activo: true });
    const put = llamadas.find((l) => l.metodo === 'PUT' && l.url === `${BASE}/users/u1`)!;
    expect(put.cuerpo).toMatchObject({
      enabled: true,
      attributes: { centro_id: ['CSN'], otro: ['x'] },
    });
    expect(llamadas.some((l) => l.metodo === 'POST' && l.url === `${BASE}/users/u1/logout`)).toBe(
      true,
    );
  });

  it('quitar el centro elimina solo ese atributo', async () => {
    const { svc, llamadas } = servicio();
    await svc.actualizar('u1', { centro: null });
    const put = llamadas.find((l) => l.metodo === 'PUT')!;
    const attrs = (put.cuerpo as { attributes: Record<string, unknown> }).attributes;
    expect(attrs).toEqual({ otro: ['x'] });
  });

  it('cambiar el rol retira los otros roles del sistema y asigna el nuevo', async () => {
    const { svc, llamadas } = servicio();
    await svc.actualizar('u1', { rol: 'encargado' });
    const mapeo = `${BASE}/users/u1/role-mappings/realm`;
    const del = llamadas.find((l) => l.metodo === 'DELETE' && l.url === mapeo)!;
    const post = llamadas.find((l) => l.metodo === 'POST' && l.url === mapeo)!;
    expect((del.cuerpo as { name: string }[]).map((r) => r.name).sort()).toEqual([
      'administrador',
      'funcionaria',
    ]);
    expect(post.cuerpo).toEqual([{ id: 'rol-encargado', name: 'encargado' }]);
    expect(llamadas.some((l) => l.metodo === 'PUT')).toBe(false);
  });

  it('traduce los fallos del servicio de identidad a errores claros', async () => {
    const lista = (f: (u: string) => Response | Error | null) => servicio({ fallar: f }).svc;
    await expect(
      lista((u) => (u.endsWith('/users?max=500') ? new Error('ECONNREFUSED') : null)).listar(),
    ).rejects.toBeInstanceOf(BadGatewayException);
    await expect(
      lista((u) => (u.endsWith('/users?max=500') ? json({}, 500) : null)).listar(),
    ).rejects.toBeInstanceOf(BadGatewayException);
    await expect(
      lista((u) => (u.includes('/users/zzz') ? json({}, 404) : null)).obtener('zzz'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      lista((u) => (u.endsWith('/token') ? json({}, 401) : null)).listar(),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('los mensajes de error no filtran el secreto del cliente', async () => {
    const { svc } = servicio({ fallar: (u) => (u.endsWith('/token') ? json({}, 401) : null) });
    const e = (await svc.listar().catch((x: unknown) => x)) as Error;
    expect(e.message).not.toContain('s3');
  });

  it('obtener devuelve el usuario con su rol', async () => {
    const { svc } = servicio();
    expect(await svc.obtener('u1')).toMatchObject({ id: 'u1', rol: 'funcionaria', centro: 'CSC' });
  });

  it('usa la dirección interna de Keycloak (Docker) para todas las llamadas del servidor', async () => {
    const llamadas: string[] = [];
    const svc = new KeycloakAdminService({
      keycloak: {
        issuer: 'http://localhost:8081/realms/x',
        internalIssuer: 'http://keycloak:8081/realms/x',
        admin: { clientId: 'adm', secret: 's3' },
      },
    } as Config);
    svc.fetchFn = (async (url: string) => {
      llamadas.push(String(url));
      if (String(url).endsWith('/token')) {
        return new Response(JSON.stringify({ access_token: 'T', expires_in: 300 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    await svc.listar().catch(() => undefined);
    expect(llamadas.length).toBeGreaterThan(1);
    expect(llamadas.every((u) => u.startsWith('http://keycloak:8081/'))).toBe(true);
    expect(llamadas.some((u) => u.includes('localhost'))).toBe(false);
  });
});
