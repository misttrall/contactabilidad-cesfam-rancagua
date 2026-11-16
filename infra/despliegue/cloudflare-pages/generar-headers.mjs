// Genera el archivo `_headers` de Cloudflare Pages a partir de la MISMA plantilla de cabeceras que usa
// nginx (infra/despliegue/seguridad.inc.template): una sola fuente para la CSP y demás cabeceras.
//
//   node infra/despliegue/cloudflare-pages/generar-headers.mjs \
//     --api https://api.ejemplo.cl --id https://id.ejemplo.cl [--frame-ancestors "'none'"] > apps/web/dist/_headers
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PLANTILLA = new URL('../seguridad.inc.template', import.meta.url);

function origenHttps(valor, nombre) {
  let u;
  try {
    u = new URL(valor);
  } catch {
    throw new Error(`${nombre} no es una URL válida: "${valor}"`);
  }
  if (u.protocol !== 'https:') throw new Error(`${nombre} debe ser https`);
  return u.origin; // sin ruta ni barra final
}

/** @param {{api: string, id: string, frameAncestors?: string}} o */
export function generarHeaders(o) {
  const vars = {
    CSP_API: origenHttps(o.api, '--api'),
    CSP_ID: origenHttps(o.id, '--id'),
    CSP_FRAME_ANCESTORS: o.frameAncestors ?? "'none'",
  };
  const lineas = readFileSync(PLANTILLA, 'utf8')
    .split('\n')
    .map((l) => /^add_header\s+(\S+)\s+"(.*)"\s+always;\s*$/.exec(l))
    .filter(Boolean)
    .map(([, nombre, valor]) =>
      `  ${nombre}: ${valor}`.replace(/\$\{(\w+)\}/g, (_m, v) => vars[v] ?? `\${${v}}`),
    );
  if (lineas.length < 5) throw new Error('La plantilla de cabeceras no tiene el formato esperado');
  // El HTML nunca se cachea; los archivos con huella (hash) son inmutables.
  return [
    '/*',
    ...lineas,
    '  Cache-Control: no-store',
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
}

function arg(n) {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const api = arg('--api');
  const id = arg('--id');
  if (!api || !id) {
    console.error(
      'Uso: generar-headers.mjs --api https://api.ejemplo.cl --id https://id.ejemplo.cl [--frame-ancestors "\'none\'"]',
    );
    process.exit(2);
  }
  process.stdout.write(generarHeaders({ api, id, frameAncestors: arg('--frame-ancestors') }));
}
