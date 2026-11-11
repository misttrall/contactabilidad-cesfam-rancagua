import { expect, type Page } from '@playwright/test';

/**
 * Usuarios FICTICIOS del realm de desarrollo (infra/keycloak/README.md). La contraseña común es la
 * de ese realm local; no existe en QA/PRODUCCION (el realm generado no trae usuarios).
 */
export const USUARIOS = {
  funcionariaCSC: 'funcionaria.csc',
  funcionariaCSN: 'funcionaria.csn',
  encargado: 'encargado.demo',
  admin: 'admin.demo',
} as const;
const CLAVE_DEV = 'Demo-1234!';

export async function ingresar(page: Page, usuario: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ingresar con tu cuenta' }).click();
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE_DEV);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}

export async function cerrarSesion(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Ingresar con tu cuenta' })).toBeVisible();
}

/** Deja la base DEMO con citas ficticias nuevas (solo el administrador; solo existe en DEMO). */
export async function restablecerDemo(page: Page) {
  await page.goto('/configuracion');
  const campo = page.getByLabel('Escribe RESTABLECER para confirmar');
  await campo.scrollIntoViewIfNeeded();
  await campo.fill('RESTABLECER');
  await page.getByRole('button', { name: 'Restablecer datos demo' }).click();
  await expect(page.getByText(/citas ficticias|restablecid/i).first()).toBeVisible();
}

/** Token de la sesión actual (oidc-client-ts lo guarda en sessionStorage). */
async function tokenDe(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)!;
      if (k.startsWith('oidc.user:')) {
        return (JSON.parse(sessionStorage.getItem(k)!) as { access_token: string }).access_token;
      }
    }
    return null;
  });
  if (!token) throw new Error('No hay sesión iniciada');
  return token;
}

/**
 * Los mensajes solo salen dentro de la ventana horaria (09:00–18:00 de Chile): fuera de ella quedan
 * programados para el día siguiente. Para que el E2E no dependa de la hora en que corre, el
 * administrador abre la ventana todo el día (o la restaura a la de fábrica).
 */
export async function fijarVentanaEnvio(
  page: Page,
  ventana: { desde: string; hasta: string },
  apiUrl = 'http://localhost:3000',
) {
  const r = await page.request.patch(`${apiUrl}/api/config/parametros/envio.ventana_horaria`, {
    headers: { Authorization: `Bearer ${await tokenDe(page)}` },
    data: { valor: ventana },
  });
  expect(r.ok(), `no se pudo fijar la ventana: ${r.status()}`).toBe(true);
}
