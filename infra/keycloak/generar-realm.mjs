// Genera el realm de QA/PRODUCCION a partir del realm de desarrollo (realm.json).
// Mantener UNA sola fuente (roles, claims, tema) evita que QA/PROD se desvíen de lo que se prueba.
//
//   node infra/keycloak/generar-realm.mjs --web https://app.ejemplo.cl --admin-secret-env KC_ADMIN_SECRET > realm-qa.json
//
// Diferencias respecto del realm de desarrollo:
//  - sin usuarios (ni el service-account de desarrollo): los usuarios reales se crean en Keycloak;
//  - sin el cliente `businesshub-dev-cli` (contraseña directa solo para pruebas locales);
//  - SSL obligatorio (`sslRequired: all`) y redirecciones solo a la URL https indicada;
//  - MFA (TOTP) obligatorio para todos y política de contraseñas;
//  - el secreto del cliente `businesshub-admin` viene del entorno, nunca del repositorio.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLIENTE_DEV = 'businesshub-dev-cli';
const CLIENTE_ADMIN = 'businesshub-admin';
const CLIENTE_WEB = 'businesshub-web';

/** @param {object} dev realm de desarrollo  @param {{web: string, adminSecret: string, ambiente?: 'QA'|'PRODUCCION'}} o */
export function generarRealm(dev, o) {
  const web = new URL(o.web);
  if (web.protocol !== 'https:') throw new Error('--web debe ser una URL https');
  if (!o.adminSecret || o.adminSecret.length < 24) {
    throw new Error('El secreto del cliente admin debe tener al menos 24 caracteres');
  }
  if (/dev-admin-secret|demo-1234/i.test(o.adminSecret)) {
    throw new Error('No se puede usar el secreto de desarrollo');
  }
  const origen = web.origin;
  const realm = structuredClone(dev);

  realm.sslRequired = 'all';
  realm.registrationAllowed = false;
  realm.resetPasswordAllowed = true;
  realm.bruteForceProtected = true;
  realm.users = [];
  realm.clients = realm.clients.filter((c) => c.clientId !== CLIENTE_DEV);

  for (const c of realm.clients) {
    if (c.clientId === CLIENTE_WEB) {
      c.redirectUris = [`${origen}/*`];
      c.webOrigins = [origen];
      c.attributes = { ...(c.attributes ?? {}), 'post.logout.redirect.uris': `${origen}/*` };
    }
    if (c.clientId === CLIENTE_ADMIN) {
      c.secret = o.adminSecret;
    }
  }

  // MFA obligatorio: TOTP como acción requerida por defecto (se pide en el primer ingreso).
  realm.requiredActions = [
    ...(realm.requiredActions ?? []).filter((a) => a.alias !== 'CONFIGURE_TOTP'),
    {
      alias: 'CONFIGURE_TOTP',
      name: 'Configure OTP',
      providerId: 'CONFIGURE_TOTP',
      enabled: true,
      defaultAction: true,
      priority: 10,
    },
  ];
  realm.otpPolicyType = 'totp';
  realm.otpPolicyAlgorithm = 'HmacSHA1';
  realm.otpPolicyDigits = 6;
  realm.otpPolicyPeriod = 30;

  realm.passwordPolicy =
    'length(12) and notUsername(undefined) and upperCase(1) and lowerCase(1) and digits(1) and passwordHistory(5)';
  realm.failureFactor = Math.min(realm.failureFactor ?? 5, 5);
  realm.permanentLockout = false;
  realm.accessTokenLifespan = Math.min(realm.accessTokenLifespan ?? 300, 300);
  realm.displayName = `${realm.displayName ?? 'BusinessHub Salud'} (${o.ambiente ?? 'QA'})`;
  return realm;
}

function arg(nombre) {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const web = arg('--web');
  const envSecreto = arg('--admin-secret-env') ?? 'KC_ADMIN_SECRET';
  const ambiente = arg('--ambiente') ?? 'QA';
  if (!web) {
    console.error(
      'Uso: node generar-realm.mjs --web https://app.ejemplo.cl [--admin-secret-env VAR] [--ambiente QA|PRODUCCION]',
    );
    process.exit(2);
  }
  const dev = JSON.parse(readFileSync(new URL('./realm.json', import.meta.url), 'utf8'));
  const realm = generarRealm(dev, { web, adminSecret: process.env[envSecreto] ?? '', ambiente });
  process.stdout.write(`${JSON.stringify(realm, null, 2)}\n`);
}
