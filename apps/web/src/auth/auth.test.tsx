import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callback = vi.fn();
const getUser = vi.fn();

vi.mock('./auth', () => ({
  RUTA_CALLBACK: '/auth/callback',
  sesionVigente: (u: { expired: boolean } | null) => u !== null && !u.expired,
  userManager: {
    signinRedirectCallback: () => callback(),
    getUser: () => getUser(),
    events: {
      addUserUnloaded: vi.fn(),
      addSilentRenewError: vi.fn(),
      removeUserUnloaded: vi.fn(),
      removeSilentRenewError: vi.fn(),
    },
  },
}));

import { AuthProvider, useAuth } from './AuthProvider';
import { reiniciarCallbackParaPruebas } from './callback';

function Estado() {
  return <p>estado:{useAuth().estado}</p>;
}

beforeEach(() => {
  callback.mockReset();
  getUser.mockReset();
  reiniciarCallbackParaPruebas();
  window.history.replaceState({}, '', '/auth/callback?code=abc&state=xyz');
});
afterEach(cleanup);

describe('AuthProvider', () => {
  it('canjea el código OIDC una sola vez aunque StrictMode monte el efecto dos veces', async () => {
    callback.mockResolvedValue({});
    getUser.mockResolvedValue({ expired: false });
    render(
      <StrictMode>
        <AuthProvider>
          <Estado />
        </AuthProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByText('estado:autenticado')).toBeTruthy());
    expect(callback).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/'); // se limpia la URL del callback
  });

  it('si el canje falla, queda en error (no autenticado)', async () => {
    callback.mockRejectedValue(new Error('Code not valid'));
    render(
      <AuthProvider>
        <Estado />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('estado:error')).toBeTruthy());
  });

  it('sin sesión guardada queda anónimo', async () => {
    window.history.replaceState({}, '', '/');
    getUser.mockResolvedValue(null);
    render(
      <AuthProvider>
        <Estado />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('estado:anonimo')).toBeTruthy());
    expect(callback).not.toHaveBeenCalled();
  });

  it('una sesión expirada se trata como anónima', async () => {
    window.history.replaceState({}, '', '/');
    getUser.mockResolvedValue({ expired: true });
    render(
      <AuthProvider>
        <Estado />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('estado:anonimo')).toBeTruthy());
  });
});
