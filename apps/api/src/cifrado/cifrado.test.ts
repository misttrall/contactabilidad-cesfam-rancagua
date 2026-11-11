import { createCipheriv, randomBytes } from 'node:crypto';
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
    expect(c.startsWith('v2:')).toBe(true);
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

describe('CifradoService: rotación de claves', () => {
  const k1 = randomBytes(32);
  const k2 = randomBytes(32);
  const con = (actual: Buffer, anteriores: Buffer[] = []) =>
    new CifradoService({ claveDatos: actual, clavesDatosAnteriores: anteriores } as Config);

  it('emite v2 con el id de la clave y no revela la clave', () => {
    const c = con(k1).cifrar('+56912345678');
    expect(c.split(':')[1]).toHaveLength(8);
    expect(c).not.toContain(k1.toString('base64'));
  });

  it('tras rotar, descifra datos de la clave anterior y los marca para re-cifrar', () => {
    const viejo = con(k1).cifrar('dato');
    const nuevo = con(k2, [k1]);
    expect(nuevo.descifrar(viejo)).toBe('dato');
    expect(nuevo.necesitaRotar(viejo)).toBe(true);
    expect(nuevo.necesitaRotar(nuevo.cifrar('dato'))).toBe(false);
  });

  it('sin la clave anterior configurada, el dato viejo no se puede abrir', () => {
    const viejo = con(k1).cifrar('dato');
    expect(() => con(k2).descifrar(viejo)).toThrow(/ya no está disponible/);
  });

  it('lee el formato v1 anterior probando las claves disponibles', () => {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', k1, iv);
    const ct = Buffer.concat([c.update('+56911112222', 'utf8'), c.final()]);
    const v1 = [
      'v1',
      iv.toString('base64'),
      c.getAuthTag().toString('base64'),
      ct.toString('base64'),
    ].join(':');
    expect(con(k1).descifrar(v1)).toBe('+56911112222');
    expect(con(k2, [k1]).descifrar(v1)).toBe('+56911112222');
    expect(con(k1).necesitaRotar(v1)).toBe(true);
    expect(() => con(k2).descifrar(v1)).toThrow();
  });

  it('la huella de búsqueda cambia con la clave (por eso la rotación la recalcula)', () => {
    expect(con(k1).hashBusqueda('+56912345678')).not.toBe(con(k2).hashBusqueda('+56912345678'));
  });

  it('hashesBusqueda incluye la huella de la clave actual (primero) y las de las anteriores', () => {
    const n = con(k2, [k1]);
    const hs = n.hashesBusqueda('+56912345678');
    expect(hs).toEqual([n.hashBusqueda('+56912345678'), con(k1).hashBusqueda('+56912345678')]);
    expect(con(k1).hashesBusqueda('+56912345678')).toHaveLength(1);
  });
});
