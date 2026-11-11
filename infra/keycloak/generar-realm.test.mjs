import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { generarRealm } from './generar-realm.mjs';

const dev = JSON.parse(readFileSync(new URL('./realm.json', import.meta.url), 'utf8'));
const SECRETO = 'S3creto-largo-y-unico-de-prueba-1234';
const gen = (o = {}) =>
  generarRealm(dev, { web: 'https://app.ejemplo.cl', adminSecret: SECRETO, ...o });

test('no deja usuarios, contraseñas de desarrollo ni el cliente dev-cli', () => {
  const r = gen();
  // Único usuario permitido: la cuenta de servicio del cliente admin, con sus roles de gestión de usuarios.
  assert.deepEqual(
    r.users.map((u) => u.serviceAccountClientId),
    ['businesshub-admin'],
  );
  assert.ok(r.users[0].clientRoles['realm-management'].includes('manage-users'));
  assert.ok(!r.users.some((u) => /demo|funcionaria|encargado/.test(u.username)));
  assert.ok(!r.clients.some((c) => c.clientId === 'businesshub-dev-cli'));
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes('Demo-1234'));
  assert.ok(!texto.includes('dev-admin-secret'));
  assert.ok(!texto.includes('localhost'));
});

test('exige https y conserva roles y claims del realm de desarrollo', () => {
  const r = gen();
  assert.equal(r.sslRequired, 'all');
  assert.deepEqual(r.roles, dev.roles);
  const web = r.clients.find((c) => c.clientId === 'businesshub-web');
  assert.deepEqual(web.redirectUris, ['https://app.ejemplo.cl/*']);
  assert.deepEqual(web.webOrigins, ['https://app.ejemplo.cl']);
  assert.equal(web.publicClient, true);
});

test('MFA (TOTP) obligatorio y política de contraseñas', () => {
  const r = gen();
  const totp = r.requiredActions.find((a) => a.alias === 'CONFIGURE_TOTP');
  assert.equal(totp.enabled, true);
  assert.equal(totp.defaultAction, true);
  assert.match(r.passwordPolicy, /length\(12\)/);
  assert.equal(r.bruteForceProtected, true);
  assert.equal(r.registrationAllowed, false);
});

test('el secreto del cliente admin viene del entorno', () => {
  const r = gen();
  assert.equal(r.clients.find((c) => c.clientId === 'businesshub-admin').secret, SECRETO);
});

test('rechaza http, secretos cortos y el secreto de desarrollo', () => {
  assert.throws(() => gen({ web: 'http://app.ejemplo.cl' }), /https/);
  assert.throws(() => gen({ adminSecret: 'corto' }), /24/);
  assert.throws(() => gen({ adminSecret: 'dev-admin-secret-no-usar-en-produccion' }), /desarrollo/);
});

test('no modifica el objeto de entrada', () => {
  const copia = JSON.stringify(dev);
  gen();
  assert.equal(JSON.stringify(dev), copia);
});
