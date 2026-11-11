import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Sin barrido periódico ni Redis implícito en las pruebas: cada prueba lo invoca a mano.
    // Los límites de tasa se apagan: las pruebas de integración hacen cientos de llamadas por minuto.
    // Los archivos que prueban el límite lo encienden (LIMITE_TASA=on).
    env: { BARRIDO_INTERVALO_MS: '0', REDIS_URL: '', LIMITE_TASA: 'off' },
    // Las pruebas de integración comparten una base de datos y «restablecer demo» borra los datos
    // operativos: los archivos corren uno tras otro para que no se pisen.
    fileParallelism: false,
  },
});
