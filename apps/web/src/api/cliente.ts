import { userManager } from '../auth/auth';
import { config } from '../config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Cuerpo completo de la respuesta de error (p. ej., columnas faltantes en un 422). */
    readonly detalle?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function solicitar(ruta: string, init: RequestInit): Promise<Response> {
  const user = await userManager.getUser();
  const res = await fetch(`${config.apiUrl}${ruta}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      // Con JSON fijamos el tipo; con FormData el navegador pone el boundary correcto.
      ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(user ? { Authorization: `Bearer ${user.access_token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) {
    await userManager.removeUser();
    void userManager.signinRedirect();
    throw new ApiError(401, 'Sesión expirada');
  }
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const m = cuerpo.message;
    const msg = Array.isArray(m) ? m.join('; ') : typeof m === 'string' ? m : undefined;
    throw new ApiError(res.status, msg ?? `Error ${res.status}`, cuerpo);
  }
  return res;
}

/** Llama a la API con el Bearer vigente. Un 401 significa sesión caída: se vuelve a Keycloak. */
export async function apiFetch<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  return (await (await solicitar(ruta, init)).json()) as T;
}

/** Descarga un archivo (p. ej., la plantilla de carga). */
export async function apiBlob(ruta: string): Promise<Blob> {
  return (await solicitar(ruta, {})).blob();
}
