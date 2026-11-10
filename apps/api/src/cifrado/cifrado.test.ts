import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cargarConfig, CLAVE_DEMO_PUBLICA, type Config } from '../config';
import { CifradoService } from './cifrado.service';

const servicio = (clave: Buffer = randomBytes(32)) =>
  new CifradoService({ claveDatos: clave } as Config);

describe('CifradoService (AES-256-GCM)', () => {
  it('descifra lo que cifra y no deja el texto en claro', () => {
    const s = servicio();
    const c = s.cifrar('+56912345678');
    expect(c).not.toContain('912345678');
    expect(c.startsWith('v1:')).toBe(true);
    expect(s.descifrar(c)).toBe('+56912345678');
  });
  it('cada cifrado usa un IV distinto', () => {
    const s = servicio();
    expect(s.cifrar('x')).not.toBe(s.cifrar('x'));
  });
  it('un valor alterado en la base de datos falla en vez de devolver basura', () => {
    const s = servicio();
    const [v, iv, tag, ct] = s.cifrar('+56912345678').split(':') as [
      string,
      string,
      string,
      string,
    ];
    const alterado = Buffer.from(ct, 'base64');
    alterado[0] = (alterado[0] ?? 0) ^ 1;
    expect(() => s.descifrar([v, iv, tag, alterado.toString('base64')].join(':'))).toThrow();
  });
  it('otra clave no puede descifrar', () => {
    expect(() => servicio().descifrar(servicio().cifrar('dato'))).toThrow();
  });
  it('rechaza formatos desconocidos', () => {
    expect(() => servicio().descifrar('texto-plano')).toThrow(/Formato/);
  });
});

describe('clave de datos en la configuración', () => {
  it('en DEMO usa la clave pública de desarrollo si no se define', () => {
    expect(cargarConfig({}).claveDatos).toEqual(CLAVE_DEMO_PUBLICA);
  });
  it('fuera de DEMO es obligatoria', () => {
    expect(() => cargarConfig({ AMBIENTE: 'QA', KEYCLOAK_ISSUER: 'https://kc/realms/x' })).toThrow(
      /DATA_ENCRYPTION_KEY/,
    );
  });
  it('debe tener 32 bytes', () => {
    expect(() =>
      cargarConfig({ DATA_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/32 bytes/);
    const ok = randomBytes(32);
    expect(cargarConfig({ DATA_ENCRYPTION_KEY: ok.toString('base64') }).claveDatos).toEqual(ok);
  });
});
