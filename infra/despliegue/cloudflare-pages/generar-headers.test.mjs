import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generarHeaders } from './generar-headers.mjs';

const gen = (o = {}) =>
  generarHeaders({ api: 'https://api.ejemplo.cl/', id: 'https://id.ejemplo.cl', ...o });

test('la CSP lleva solo la API y el servicio de identidad configurados, sin variables sin resolver', () => {
  const h = gen();
  assert.match(h, /connect-src 'self' https:\/\/api\.ejemplo\.cl https:\/\/id\.ejemplo\.cl;/);
  assert.match(h, /frame-ancestors 'none'/);
  assert.ok(!h.includes('${'));
  assert.ok(!/unsafe-eval/.test(h));
  assert.match(h, /script-src 'self';/);
});

test('mismas cabeceras que nginx: HSTS, nosniff, no-referrer, y caché correcta por ruta', () => {
  const h = gen();
  assert.match(h, /Strict-Transport-Security: max-age=31536000; includeSubDomains/);
  assert.match(h, /X-Content-Type-Options: nosniff/);
  assert.match(h, /Referrer-Policy: no-referrer/);
  assert.match(h, /^\/\*\n[\s\S]*Cache-Control: no-store/m);
  assert.match(h, /\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable/);
});

test('permite embeber solo donde se indique (AVIS)', () => {
  assert.match(
    gen({ frameAncestors: "'self' https://avis.ejemplo.cl" }),
    /frame-ancestors 'self' https:\/\/avis\.ejemplo\.cl;/,
  );
});

test('rechaza http y URLs inválidas', () => {
  assert.throws(() => gen({ api: 'http://api.ejemplo.cl' }), /https/);
  assert.throws(() => gen({ id: 'no es url' }), /válida/);
});
