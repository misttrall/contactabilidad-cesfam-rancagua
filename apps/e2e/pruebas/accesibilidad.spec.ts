import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ingresar, USUARIOS } from './ayudas';

/** WCAG 2.2 AA (skill diseno-clinico-avis §5): cero violaciones en todas las pantallas. */
const ETIQUETAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function auditar(page: Page, nombre: string) {
  const r = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
  const resumen = r.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );
  expect(resumen, `Violaciones de accesibilidad en ${nombre}`).toEqual([]);
}

const PANTALLAS: { ruta: string; titulo: RegExp }[] = [
  { ruta: '/', titulo: /Hola,/ },
  { ruta: '/cargas', titulo: /Cargar planilla/ },
  { ruta: '/confirmaciones', titulo: /Confirmación masiva/ },
  { ruta: '/pendientes', titulo: /Pendientes por llamar/ },
  { ruta: '/llamadas/nueva', titulo: /Llamada entrante/ },
  { ruta: '/llamadas', titulo: /Historial de llamadas/ },
  { ruta: '/reportes', titulo: /Reportes/ },
  { ruta: '/configuracion', titulo: /Configuración/ },
];

test.describe('axe: accesibilidad', () => {
  test('pantalla de ingreso (portada y Keycloak)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Ingresar con tu cuenta' })).toBeVisible();
    await auditar(page, 'portada');
    await page.getByRole('button', { name: 'Ingresar con tu cuenta' }).click();
    await expect(page.getByLabel('Usuario')).toBeVisible();
    await auditar(page, 'inicio de sesión (tema Keycloak)');
  });

  test('todas las pantallas del administrador', async ({ page }) => {
    await ingresar(page, USUARIOS.admin);
    for (const p of PANTALLAS) {
      await page.goto(p.ruta);
      await expect(page.getByRole('heading', { level: 1, name: p.titulo })).toBeVisible();
      // espera a que termine de cargar datos (no hay «Cargando…»)
      await expect(page.getByText(/^(Cargando|Calculando)/)).toHaveCount(0);
      await auditar(page, p.ruta);
    }
  });

  test('pantallas de la funcionaria (alcance de un solo centro)', async ({ page }) => {
    await ingresar(page, USUARIOS.funcionariaCSC);
    for (const p of PANTALLAS.filter((x) => !['/configuracion', '/reportes'].includes(x.ruta))) {
      await page.goto(p.ruta);
      await expect(page.getByRole('heading', { level: 1, name: p.titulo })).toBeVisible();
      await expect(page.getByText(/^(Cargando|Calculando)/)).toHaveCount(0);
      await auditar(page, `${p.ruta} (funcionaria)`);
    }
  });
});
