import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RUTA_CALLBACK, sesionVigente, userManager } from './auth';
import { procesarCallbackUnaVez } from './callback';

type Estado = 'cargando' | 'anonimo' | 'autenticado' | 'error';

interface AuthContexto {
  estado: Estado;
  error?: string;
  iniciarSesion: () => void;
  cerrarSesion: () => void;
}

const Contexto = createContext<AuthContexto | null>(null);

export function useAuth(): AuthContexto {
  const c = useContext(Contexto);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}

/**
 * Resuelve la sesión ANTES de montar el router: si venimos del callback de Keycloak,
 * canjea el código y limpia la URL.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        if (window.location.pathname === RUTA_CALLBACK) await procesarCallbackUnaVez();
        const u = await userManager.getUser();
        if (!cancelado) setEstado(sesionVigente(u) ? 'autenticado' : 'anonimo');
      } catch (e) {
        window.history.replaceState({}, '', '/');
        if (!cancelado) {
          setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
          setEstado('error');
        }
      }
    })();
    // Si el refresco silencioso falla o la sesión se cierra en otra pestaña, volver a la portada.
    const alExpirar = () => setEstado('anonimo');
    userManager.events.addUserUnloaded(alExpirar);
    userManager.events.addSilentRenewError(alExpirar);
    return () => {
      cancelado = true;
      userManager.events.removeUserUnloaded(alExpirar);
      userManager.events.removeSilentRenewError(alExpirar);
    };
  }, []);

  const valor = useMemo<AuthContexto>(
    () => ({
      estado,
      ...(error ? { error } : {}),
      iniciarSesion: () => void userManager.signinRedirect(),
      cerrarSesion: () => void userManager.signoutRedirect(),
    }),
    [estado, error],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
