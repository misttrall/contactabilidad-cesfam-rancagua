/**
 * Semilla idempotente con datos CLARAMENTE ficticios (RNF-01). Solo para DEMO/QA.
 * Uso: pnpm --filter @bh/api db:seed
 */
import { PrismaClient } from '@prisma/client';
import { CENTROS_SEMILLA, MOTIVOS_SEMILLA } from '@bh/shared';

const prisma = new PrismaClient();

const PROFESIONALES_DEMO = [
  { nombre: 'Dra. Demo Uno', especialidad: 'Medicina general' },
  { nombre: 'Dr. Demo Dos', especialidad: 'Medicina general' },
  { nombre: 'Enf. Demo Tres', especialidad: 'Enfermería' },
];

const PARAMETROS = {
  'envio.anticipacion_horas': 48,
  'envio.ventana_horaria': { desde: '09:00', hasta: '18:00' },
  'envio.horas_espera_respuesta': 24,
  'envio.segundo_mensaje_adulto_mayor': true,
  'carga.excluir_morbilidad_por_defecto': true,
};

async function main() {
  for (const c of CENTROS_SEMILLA) {
    const centro = await prisma.centro.upsert({
      where: { codigo: c.codigo },
      update: { nombre: c.nombre },
      create: { codigo: c.codigo, nombre: c.nombre },
    });
    const existentes = await prisma.profesional.count({ where: { centroId: centro.id } });
    if (existentes === 0) {
      await prisma.profesional.createMany({
        data: PROFESIONALES_DEMO.map((p) => ({ ...p, centroId: centro.id })),
      });
    }
  }

  for (const [i, m] of MOTIVOS_SEMILLA.entries()) {
    await prisma.motivoLlamada.upsert({
      where: { codigo: m.codigo },
      update: { descripcion: m.descripcion, orden: i },
      create: { codigo: m.codigo, descripcion: m.descripcion, orden: i },
    });
  }

  for (const [clave, valor] of Object.entries(PARAMETROS)) {
    await prisma.parametro.upsert({
      where: { clave },
      update: {},
      create: { clave, valor },
    });
  }

  const [c, m, p] = await Promise.all([
    prisma.centro.count(),
    prisma.motivoLlamada.count(),
    prisma.profesional.count(),
  ]);
  console.log(`Semilla lista: ${c} centros, ${m} motivos, ${p} profesionales`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
