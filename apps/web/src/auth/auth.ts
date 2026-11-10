import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { config } from '../config';

/**
 * Authorization Code + PKCE contra Keycloak. Los tokens se guardan en sessionStorage:
 * se borran al cerrar la pestaña (puestos compartidos de call center).
 */
export const userManager = new UserManager({
  authority: config.keycloakIssuer,
  client_id: config.clientId,
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: true,
});

export const RUTA_CALLBACK = '/auth/callback';

export function sesionVigente(u: User | null): u is User {
  return u !== null && !u.expired;
}
