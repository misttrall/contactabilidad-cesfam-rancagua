import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de los flujos A (confirmación masiva) y B (llamada entrante) y accesibilidad con axe.
 * Requiere Postgres, Redis y Keycloak (docker compose up -d) y las migraciones aplicadas.
 * La API y la web se levantan solas (o se reutilizan si ya corren).
 *
 *   pnpm --filter @bh/e2e e2e
 *
 * Variables:  E2E_CANAL=chrome  usa el Chrome instalado (sin descargar navegadores);
 *             CI=1              usa Chromium de Playwright (`playwright install --with-deps chromium`).
 */
const CANAL = process.env.E2E_CANAL;

export default defineConfig({
  testDir: './pruebas',
  // Los flujos comparten la base de datos (restablecer demo borra todo): en serie.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'escritorio-1366',
      use: {
        ...devices['Desktop Chrome'],
        ...(CANAL ? { channel: CANAL } : {}),
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      // Lado a lado con AVIS: ventana angosta (skill diseno-clinico-avis).
      name: 'lado-a-lado-640',
      use: {
        ...devices['Desktop Chrome'],
        ...(CANAL ? { channel: CANAL } : {}),
        viewport: { width: 640, height: 800 },
      },
      testMatch: /accesibilidad\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @bh/api dev',
      url: 'http://localhost:3000/health',
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: '../..',
    },
    {
      command: 'pnpm --filter @bh/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: '../..',
    },
  ],
});
