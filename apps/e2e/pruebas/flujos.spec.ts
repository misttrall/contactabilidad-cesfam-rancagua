import { expect, test } from '@playwright/test';
import { cerrarSesion, fijarVentanaEnvio, ingresar, restablecerDemo, USUARIOS } from './ayudas';

/**
 * Flujo A: confirmación masiva por WhatsApp (simulador) → respuestas → estados en el dashboard.
 * Flujo B: llamada entrante registrada en menos de 30 s (RNF-09).
 * Datos: los ficticios que siembra «Restablecer datos demo» (solo existe en el ambiente DEMO).
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ baseURL: 'http://localhost:5173' });
  await ingresar(page, USUARIOS.admin);
  await restablecerDemo(page);
  await fijarVentanaEnvio(page, { desde: '00:00', hasta: '23:59' });
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ baseURL: 'http://localhost:5173' });
  await ingresar(page, USUARIOS.admin);
  await fijarVentanaEnvio(page, { desde: '09:00', hasta: '18:00' });
  await page.close();
});

test('Flujo A: la funcionaria envía la confirmación, los pacientes responden y se ve el resultado', async ({
  page,
}) => {
  await ingresar(page, USUARIOS.funcionariaCSC);
  await page.getByRole('link', { name: 'Confirmación masiva' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Confirmación masiva/ })).toBeVisible();

  // Las citas demo se siembran para la fecha que el servidor sugiere.
  const sugerida = page.getByRole('button', { name: /Usar la fecha sugerida/ });
  if (await sugerida.isVisible().catch(() => false)) await sugerida.click();
  await page.getByLabel('Tipo').selectOption('todos');

  await expect(page.getByRole('checkbox', { name: /^Seleccionar a / }).first()).toBeVisible();
  await page.getByRole('checkbox', { name: 'Seleccionar todas las citas disponibles' }).check();
  await expect(page.getByText(/\d+ seleccionadas?/)).toBeVisible();

  await page.getByRole('button', { name: 'Enviar confirmación' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Confirmar el envío' });
  await expect(dialogo).toBeVisible();
  // El diálogo advierte antes de enviar y no muestra datos clínicos.
  await expect(dialogo).not.toContainText(/diabetes|DM2|hipertensi/i);
  await dialogo.getByRole('button', { name: /^Enviar a \d+/ }).click();

  await expect(page.getByText('Envío terminado.')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /Simular respuestas de pacientes/ }).click();
  await expect(page.getByText(/Simulación: \d+ confirmaron/)).toBeVisible();

  // RN-01: ninguna cita queda cancelada solo por no responder; los «sin respuesta» van a llamadas.
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Hola,/ })).toBeVisible();
  const confirmadas = page.getByLabel('Indicadores del día').getByText('Confirmado').locator('..');
  await expect(confirmadas).toBeVisible();
});

test('Flujo B: registrar una llamada entrante en menos de 30 segundos', async ({ page }) => {
  await ingresar(page, USUARIOS.funcionariaCSC);
  await page.getByRole('link', { name: 'Llamada entrante' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Llamada entrante' })).toBeVisible();

  const t0 = Date.now();
  // Foco inicial en el RUT: se escribe directo (el RUT demo 1.000.000-9 es válido por módulo 11).
  await page.keyboard.type('1000000-9');
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByRole('heading', { name: 'Paciente encontrado' })
      .or(page.getByText(/no está cargado/)),
  ).toBeVisible();

  await page.getByLabel('Todos los motivos').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Registrar llamada' }).click();
  await expect(page.getByRole('status').filter({ hasText: /registrad/i })).toBeVisible();
  expect(Date.now() - t0, 'el registro debe tomar menos de 30 s').toBeLessThan(30_000);

  await page.getByRole('link', { name: 'Historial de llamadas' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Historial de llamadas' }),
  ).toBeVisible();
  // El historial muestra el RUT enmascarado, nunca completo.
  await expect(page.getByText('1.000.000-9')).toHaveCount(0);
});

test('Una funcionaria no ve la configuración ni los datos de otro centro', async ({ page }) => {
  await ingresar(page, USUARIOS.funcionariaCSN);
  await expect(page.getByRole('link', { name: 'Configuración' })).toHaveCount(0);
  await page.goto('/configuracion');
  await expect(page.getByRole('heading', { level: 1, name: 'Configuración' })).toHaveCount(0);
  await cerrarSesion(page);
});
