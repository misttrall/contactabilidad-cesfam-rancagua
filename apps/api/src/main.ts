import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { crearApp } from './app';
import { cargarConfig } from './config';

/**
 * Desarrollo: lee apps/api/.env si existe. No pisa variables ya definidas, así que en
 * QA/PRODUCCION manda el entorno real (gestor de secretos) y el archivo no se usa.
 */
function cargarEnvLocal() {
  const archivo = resolve(__dirname, '..', '.env');
  if (existsSync(archivo)) process.loadEnvFile(archivo);
}

async function arrancar() {
  cargarEnvLocal();
  const { puerto, ambiente } = cargarConfig();
  const app = await crearApp();
  await app.listen(puerto);
  console.log(`API BusinessHub Salud [${ambiente}] escuchando en :${puerto}`);
}

arrancar().catch((err) => {
  console.error(err);
  process.exit(1);
});
