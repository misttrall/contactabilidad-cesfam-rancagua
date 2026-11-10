import { crearApp } from './app';
import { cargarConfig } from './config';

async function arrancar() {
  const { puerto, ambiente } = cargarConfig();
  const app = await crearApp();
  await app.listen(puerto);
  console.log(`API BusinessHub Salud [${ambiente}] escuchando en :${puerto}`);
}

arrancar().catch((err) => {
  console.error(err);
  process.exit(1);
});
