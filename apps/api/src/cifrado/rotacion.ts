import { CifradoService } from './cifrado.service';

interface PacienteFila {
  id: string;
  telefonoCifrado: string | null;
  telefonoHash: string | null;
}
/** Lo mínimo de Prisma que usa la rotación (facilita probarla sin base de datos). */
export interface AlmacenRotacion {
  paciente: {
    findMany(a: {
      where: { telefonoCifrado: { not: null }; id?: { gt: string } };
      orderBy: { id: 'asc' };
      take: number;
      select: { id: true; telefonoCifrado: true; telefonoHash: true };
    }): Promise<PacienteFila[]>;
    update(a: {
      where: { id: string };
      data: { telefonoCifrado: string; telefonoHash: string };
    }): Promise<unknown>;
  };
}

export interface ResultadoRotacion {
  revisados: number;
  rotados: number;
  fallidos: number;
}

/**
 * Re-cifra los teléfonos con la clave actual y recalcula la huella de búsqueda (que depende de la
 * clave). Es idempotente: se puede repetir y reanudar. Un registro que no descifra se cuenta como
 * fallido y se deja intacto (no se pierde el dato).
 */
export async function rotarClaves(
  db: AlmacenRotacion,
  cifrado: CifradoService,
  opciones: { lote?: number; simular?: boolean } = {},
): Promise<ResultadoRotacion> {
  const lote = opciones.lote ?? 500;
  const r: ResultadoRotacion = { revisados: 0, rotados: 0, fallidos: 0 };
  let desde: string | undefined;
  for (;;) {
    const filas = await db.paciente.findMany({
      where: { telefonoCifrado: { not: null }, ...(desde ? { id: { gt: desde } } : {}) },
      orderBy: { id: 'asc' },
      take: lote,
      select: { id: true, telefonoCifrado: true, telefonoHash: true },
    });
    if (filas.length === 0) return r;
    for (const f of filas) {
      desde = f.id;
      r.revisados += 1;
      const valor = f.telefonoCifrado!;
      try {
        const plano = cifrado.descifrar(valor);
        const rota = cifrado.necesitaRotar(valor);
        if (rota) r.rotados += 1;
        const hash = cifrado.hashBusqueda(plano);
        // Solo se escribe lo que cambia: una segunda pasada (o reanudar) no toca las filas ya rotadas.
        if (!opciones.simular && (rota || f.telefonoHash !== hash)) {
          await db.paciente.update({
            where: { id: f.id },
            data: { telefonoCifrado: rota ? cifrado.cifrar(plano) : valor, telefonoHash: hash },
          });
        }
      } catch {
        r.fallidos += 1;
      }
    }
  }
}
