import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Config } from '../config';

export interface VerificadorToken {
  /** Devuelve el payload si el token es válido; lanza si no (firma, emisor, audiencia o expiración). */
  verificar(token: string): Promise<JWTPayload>;
}

/** Verificador real: firma RS256 contra el JWKS de Keycloak, con emisor y audiencia exigidos. */
export function crearVerificadorKeycloak(cfg: Config['keycloak']): VerificadorToken {
  const jwks = createRemoteJWKSet(new URL(cfg.jwksUrl), { cooldownDuration: 30_000 });
  return {
    async verificar(token) {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: cfg.issuer,
        audience: cfg.audience,
        algorithms: ['RS256'],
        clockTolerance: 5,
      });
      return payload;
    },
  };
}
