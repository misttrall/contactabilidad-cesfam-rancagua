import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Sin barrido periódico ni Redis implícito en las pruebas: cada prueba lo invoca a mano.
    env: { BARRIDO_INTERVALO_MS: '0', REDIS_URL: '' },
    // Las pruebas de integración comparten una base de datos y «restablecer demo» borra los datos
    // operativos: los archivos corren uno tras otro para que no se pisen.
    fileParallelism: false,
  },
});
