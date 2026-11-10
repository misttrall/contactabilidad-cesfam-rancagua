import { userManager } from '../auth/auth';
import { config } from '../config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Llama a la API con el Bearer vigente. Un 401 significa sesión caída: se vuelve a Keycloak. */
export async function apiFetch<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const user = await userManager.getUser();
  const res = await fetch(`${config.apiUrl}${ruta}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
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
    const cuerpo = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(cuerpo.message) ? cuerpo.message.join('; ') : cuerpo.message;
    throw new ApiError(res.status, msg ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}
