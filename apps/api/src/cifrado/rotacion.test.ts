import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Config } from '../config';
import { CifradoService } from './cifrado.service';
import { rotarClaves, type AlmacenRotacion } from './rotacion';

const k1 = randomBytes(32);
const k2 = randomBytes(32);
const svc = (a: Buffer, ant: Buffer[] = []) =>
  new CifradoService({ claveDatos: a, clavesDatosAnteriores: ant } as Config);

interface Fila {
  id: string;
  telefonoCifrado: string | null;
  telefonoHash: string | null;
}
function almacen(filas: Fila[]): AlmacenRotacion {
  return {
    paciente: {
      findMany: async ({ where, take }) =>
        filas
          .filter((f) => f.telefonoCifrado !== null && (!where.id || f.id > where.id.gt))
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, take)
          .map((f) => ({ id: f.id, telefonoCifrado: f.telefonoCifrado })),
      update: async ({ where, data }) => {
        Object.assign(
          filas.find((f) => f.id === where.id)!,
          data,
        );
      },
    },
  };
}

describe('rotarClaves', () => {
  const crear = (): Fila[] => {
    const viejo = svc(k1);
    return ['a', 'b', 'c'].map((id, i) => ({
      id,
      telefonoCifrado: viejo.cifrar(`+5691234000${i}`),
      telefonoHash: viejo.hashBusqueda(`+5691234000${i}`),
    }));
  };

  it('re-cifra con la clave nueva, recalcula la huella y conserva el dato', async () => {
    const filas = crear();
    const nuevo = svc(k2, [k1]);
    const r = await rotarClaves(almacen(filas), nuevo, { lote: 2 });
    expect(r).toEqual({ revisados: 3, rotados: 3, fallidos: 0 });
    for (const [i, f] of filas.entries()) {
      expect(nuevo.necesitaRotar(f.telefonoCifrado!)).toBe(false);
      expect(nuevo.descifrar(f.telefonoCifrado!)).toBe(`+5691234000${i}`);
      expect(f.telefonoHash).toBe(nuevo.hashBusqueda(`+5691234000${i}`));
    }
    // Sin la clave vieja ya funciona todo: se puede retirar.
    expect(svc(k2).descifrar(filas[0]!.telefonoCifrado!)).toBe('+56912340000');
  });

  it('es idempotente: una segunda pasada no rota nada', async () => {
    const filas = crear();
    const nuevo = svc(k2, [k1]);
    await rotarClaves(almacen(filas), nuevo);
    expect((await rotarClaves(almacen(filas), nuevo)).rotados).toBe(0);
  });

  it('simular no modifica datos', async () => {
    const filas = crear();
    const antes = JSON.stringify(filas);
    const r = await rotarClaves(almacen(filas), svc(k2, [k1]), { simular: true });
    expect(r.rotados).toBe(3);
    expect(JSON.stringify(filas)).toBe(antes);
  });

  it('un registro que no descifra se cuenta como fallido y queda intacto', async () => {
    const filas = crear();
    filas[1]!.telefonoCifrado = svc(randomBytes(32)).cifrar('ajeno');
    const malo = filas[1]!.telefonoCifrado;
    const r = await rotarClaves(almacen(filas), svc(k2, [k1]));
    expect(r).toEqual({ revisados: 3, rotados: 2, fallidos: 1 });
    expect(filas[1]!.telefonoCifrado).toBe(malo);
  });
});
