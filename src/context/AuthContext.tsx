import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { Rol, Usuario } from '../data/types';
import { usuarios } from '../data/mockData';
import { loadSession, saveSession, type DemoSession } from '../lib/storage';

type AuthContextValue = {
  ready: boolean;
  session: DemoSession | null;
  user: Usuario | null;
  loginAs: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  canAccess: (path: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Rutas restringidas por rol. */
const ROLE_ROUTES: Record<Rol, string[] | '*'> = {
  funcionaria: [
    '/',
    '/carga-citas',
    '/confirmacion-masiva',
    '/pendientes',
    '/llamada-entrante',
    '/historial',
  ],
  encargado: [
    '/',
    '/carga-citas',
    '/confirmacion-masiva',
    '/pendientes',
    '/llamada-entrante',
    '/historial',
    '/reportes',
  ],
  administrador: '*',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<DemoSession | null>(null);

  useEffect(() => {
    loadSession()
      .then((s) => setSession(s))
      .finally(() => setReady(true));
  }, []);

  const user = useMemo(
    () => (session ? usuarios.find((u) => u.id === session.userId) ?? null : null),
    [session]
  );

  const loginAs = useCallback(async (userId: string) => {
    const u = usuarios.find((x) => x.id === userId && x.activo);
    if (!u) throw new Error('Usuario no encontrado');
    const next: DemoSession = {
      userId: u.id,
      rol: u.rol,
      nombre: u.nombre,
      apellido: u.apellido,
      centroId: u.centroId,
    };
    await saveSession(next);
    setSession(next);
  }, []);

  const logout = useCallback(async () => {
    await saveSession(null);
    setSession(null);
  }, []);

  const canAccess = useCallback(
    (path: string) => {
      if (!session) return false;
      const allowed = ROLE_ROUTES[session.rol];
      if (allowed === '*') return true;
      return allowed.includes(path);
    },
    [session]
  );

  const value = useMemo(
    () => ({ ready, session, user, loginAs, logout, canAccess }),
    [ready, session, user, loginAs, logout, canAccess]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
