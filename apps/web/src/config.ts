import { leerAmbiente } from '@bh/ui';

export const config = {
  ambiente: leerAmbiente(import.meta.env.VITE_AMBIENTE),
  apiUrl: (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  keycloakIssuer:
    import.meta.env.VITE_KEYCLOAK_ISSUER ?? 'http://localhost:8081/realms/businesshub',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'businesshub-web',
};
