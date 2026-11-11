/**
 * Rotación de la clave de cifrado de datos (ver docs/mvp/OPERACION.md, «Rotación de secretos»):
 *   1. Poner la clave NUEVA en DATA_ENCRYPTION_KEY y la vieja en DATA_ENCRYPTION_KEY_ANTERIORES.
 *   2. pnpm --filter @bh/api rotar-claves            (con --simular solo cuenta, no escribe)
 *   3. Cuando «fallidos» sea 0, retirar la clave vieja.
 */
import { PrismaClient } from '@prisma/client';
import { CifradoService } from '../src/cifrado/cifrado.service';
import { rotarClaves } from '../src/cifrado/rotacion';
import { cargarConfig } from '../src/config';

async function main() {
  const simular = process.argv.includes('--simular');
  const prisma = new PrismaClient();
  try {
    const r = await rotarClaves(prisma, new CifradoService(cargarConfig()), { simular });
    const pref = simular ? '[simulación] ' : '';
    console.log(`${pref}revisados=${r.revisados} rotados=${r.rotados} fallidos=${r.fallidos}`);
    if (r.fallidos > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
void main();
