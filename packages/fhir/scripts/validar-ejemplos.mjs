// Validación estructural mínima de los ejemplos (S0).
// En S6 se reemplaza/complementa por el HL7 FHIR Validator oficial contra CL Core y la guía MINSAL
// (ver .github/workflows/ci.yml, job "fhir-validator", que hoy corre solo la validación estructural).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../examples/', import.meta.url);
let errores = 0;
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.json')) continue;
  const r = JSON.parse(readFileSync(join(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1'), f), 'utf8'));
  const esperado = f.split('-')[0];
  if (r.resourceType !== esperado) {
    console.error(`${f}: resourceType "${r.resourceType}" no coincide con el nombre del archivo`);
    errores++;
  }
  if (!r.id) {
    console.error(`${f}: falta id`);
    errores++;
  }
}
if (errores) process.exit(1);
console.log('Ejemplos FHIR: estructura OK');
