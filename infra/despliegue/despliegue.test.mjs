import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const leer = (n) => readFileSync(new URL(n, import.meta.url), 'utf8');
const seg = leer('./seguridad.inc.template');
const csp = /Content-Security-Policy "([^"]+)"/.exec(seg)?.[1] ?? '';
const directiva = (n) =>
  csp
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${n} `));

test('la CSP de la web bloquea scripts externos y embebido no autorizado', () => {
  assert.equal(directiva('default-src'), "default-src 'self'");
  assert.equal(directiva('script-src'), "script-src 'self'");
  assert.ok(!/unsafe-inline|unsafe-eval/.test(directiva('script-src')));
  assert.ok(!/unsafe-eval/.test(csp));
  assert.equal(directiva('object-src'), "object-src 'none'");
  assert.equal(directiva('base-uri'), "base-uri 'none'");
  assert.match(directiva('frame-ancestors'), /\$\{CSP_FRAME_ANCESTORS\}/);
  assert.match(csp, /upgrade-insecure-requests/);
});

test('connect-src solo permite la API y el servicio de identidad configurados', () => {
  assert.equal(directiva('connect-src'), "connect-src 'self' ${CSP_API} ${CSP_ID}");
});

test('HSTS, nosniff y no-referrer presentes', () => {
  assert.match(seg, /Strict-Transport-Security "max-age=31536000; includeSubDomains"/);
  assert.match(seg, /X-Content-Type-Options "nosniff"/);
  assert.match(seg, /Referrer-Policy "no-referrer"/);
});

test('cada location incluye las cabeceras (nginx no las hereda si el bloque define otras)', () => {
  const conf = leer('./nginx.conf.template');
  const bloques = conf.match(/location (\/assets\/|\/) \{[^}]+\}/g) ?? [];
  assert.equal(bloques.length, 2);
  for (const b of bloques) assert.match(b, /include \/etc\/nginx\/conf\.d\/seguridad\.inc;/);
  assert.match(conf, /server_tokens off;/);
});

test('el Dockerfile web limita envsubst a las variables de la CSP (no rompe $uri de nginx)', () => {
  const d = leer('./Dockerfile.web');
  assert.match(d, /NGINX_ENVSUBST_FILTER="\^\(CSP_API\|CSP_ID\|CSP_FRAME_ANCESTORS\)\$"/);
});
