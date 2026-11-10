import { userManager } from './auth';

let enCurso: Promise<void> | null = null;

/**
 * Canjea el código de autorización de Keycloak UNA sola vez por carga de página.
 * Un código OIDC es de un solo uso: React.StrictMode (desarrollo) ejecuta los efectos dos veces
 * y el segundo canje fallaría con "Code not valid" aunque el primero haya funcionado.
 */
export function procesarCallbackUnaVez(): Promise<void> {
  enCurso ??= userManager.signinRedirectCallback().then(() => {
    window.history.replaceState({}, '', '/');
  });
  return enCurso;
}

/** Solo para pruebas. */
export function reiniciarCallbackParaPruebas() {
  enCurso = null;
}
