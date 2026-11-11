/**
 * Los ejemplos de `examples/` son la salida REAL de los mapeadores, con datos ficticios. Esta prueba
 * los regenera y los compara: si cambia un mapeador, falla hasta que se actualicen los ejemplos
 *   ACTUALIZAR_EJEMPLOS=1 pnpm --filter @bh/fhir test
 * y así el HL7 FHIR Validator oficial (CI) siempre valida lo que el sistema emite de verdad.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calcularDv, type FilaCarga } from '@bh/shared';
import { construirCapabilityStatement } from './capability';
import {
  bundleSearchset,
  codeSystemMotivos,
  codeSystemResultadoLlamada,
  codeSystemTipoCita,
  codeSystemEstadoContacto,
  organizacionAFhir,
  practitionerAFhir,
  practitionerRoleAFhir,
  ubicacionAFhir,
} from './catalogos';
import { citaAFhir, construirBundleCarga, tareaContactoAFhir } from './citas';
import { bajaCanalAFhir, liberacionAFhir, mensajeAFhir, respuestaCitaAFhir } from './mensajes';
import { pacienteAFhir } from './recursos';

const DIR = join(__dirname, '..', 'examples');
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rut = (n: number) => `${n}-${calcularDv(String(n))}`;
const FECHA = new Date('2026-11-20T15:00:00.000Z');

const centro = { id: U(1), codigo: 'DEMO', nombre: 'Cesfam Demo Uno', activo: true };
const profesional = {
  id: U(2),
  nombre: 'Dra. Demo Uno',
  especialidad: 'Medicina general',
  centroId: centro.id,
  activo: true,
};
const cita = {
  id: U(3),
  centroId: centro.id,
  pacienteId: U(4),
  profesionalId: profesional.id,
  profesionalNombre: profesional.nombre,
  fecha: '2026-11-25',
  hora: '09:30',
  prestacion: 'Control de salud',
  tipo: 'cronico' as const,
};
const paciente = pacienteAFhir(
  {
    rut: rut(1_000_001),
    nombre: 'Paciente Demo 001',
    sexo: 'F',
    telefono: '+56900000001',
    fechaNacimiento: '1950-03-01',
  },
  cita.pacienteId,
);
const filaCarga: FilaCarga = {
  paciente: 'Paciente Demo 001',
  rut: rut(1_000_001),
  telefono: '+56900000001',
  fecha: '2026-11-25',
  hora: '09:30',
  profesional: 'Dra. Demo Uno',
  prestacion: 'Control de salud',
  tipo: 'cronico',
};

/** El Bundle usa urn:uuid aleatorios: se renumeran para que el ejemplo sea estable. */
function estabilizarUrn<T>(recurso: T): T {
  const vistos = new Map<string, string>();
  const texto = JSON.stringify(recurso).replace(/urn:uuid:[0-9a-f-]{36}/g, (m) => {
    if (!vistos.has(m)) vistos.set(m, `urn:uuid:${U(100 + vistos.size)}`);
    return vistos.get(m)!;
  });
  return JSON.parse(texto) as T;
}

/** nombre de archivo (`<Tipo>-<descripción>.json`) -> contenido */
const EJEMPLOS: Record<string, unknown> = {
  'Patient-demo-001': paciente,
  'Organization-demo': organizacionAFhir(centro),
  'Location-demo': ubicacionAFhir(centro),
  'Practitioner-demo': practitionerAFhir(profesional),
  'PractitionerRole-demo': practitionerRoleAFhir(profesional),
  'Appointment-demo': citaAFhir(cita),
  'Task-contacto-enviado': tareaContactoAFhir({ id: U(5), estado: 'enviado' }, cita.id),
  'Task-liberar-hora-avis': liberacionAFhir({ id: U(6), citaId: cita.id, creadaEn: FECHA }),
  'Communication-confirmacion': mensajeAFhir({
    id: U(7),
    citaId: cita.id,
    pacienteId: cita.pacienteId,
    tipo: 'confirmacion',
    estado: 'leido',
    enviadoEn: FECHA,
    entregadoEn: FECHA,
  }),
  'AppointmentResponse-si': respuestaCitaAFhir({
    id: U(8),
    citaId: cita.id,
    pacienteId: cita.pacienteId,
    respuesta: 'si',
    respondidoEn: FECHA,
  }),
  'Consent-baja-whatsapp': bajaCanalAFhir({
    id: U(9),
    pacienteId: cita.pacienteId,
    registradoEn: FECHA,
  }),
  'CodeSystem-motivo-llamada': codeSystemMotivos([
    { codigo: 'CONSULTA', descripcion: 'Consulta de horario' },
  ]),
  'CodeSystem-resultado-llamada': codeSystemResultadoLlamada(),
  'CodeSystem-tipo-cita': codeSystemTipoCita(),
  'CodeSystem-estado-contacto': codeSystemEstadoContacto(),
  'Bundle-searchset-appointment': bundleSearchset(
    [citaAFhir(cita)],
    'https://demo.example/fhir/R4',
  ),
  'Bundle-carga-transaction': estabilizarUrn(construirBundleCarga([filaCarga], centro.id)),
  'CapabilityStatement-metadata': construirCapabilityStatement({
    version: '0.2.0',
    fecha: '2026-11-20T15:00:00.000Z',
    baseUrl: 'https://demo.example/fhir/R4',
  }),
};

describe('ejemplos FHIR sincronizados con los mapeadores', () => {
  for (const [nombre, recurso] of Object.entries(EJEMPLOS)) {
    it(`${nombre}.json`, () => {
      const ruta = join(DIR, `${nombre}.json`);
      const texto = `${JSON.stringify(recurso, null, 2)}\n`;
      if (process.env.ACTUALIZAR_EJEMPLOS === '1') writeFileSync(ruta, texto);
      expect(existsSync(ruta), `falta ${nombre}.json (ACTUALIZAR_EJEMPLOS=1)`).toBe(true);
      expect(JSON.parse(readFileSync(ruta, 'utf8'))).toEqual(JSON.parse(texto));
    });
  }

  it('no hay ejemplos huérfanos ni con datos que parezcan reales', async () => {
    const { readdirSync } = await import('node:fs');
    const archivos = readdirSync(DIR).filter((f) => f.endsWith('.json'));
    const esperados = Object.keys(EJEMPLOS).map((n) => `${n}.json`);
    // El ejemplo histórico Patient-demo-001 también está generado; cualquier otro sobra.
    expect(archivos.sort()).toEqual(esperados.sort());
    for (const f of archivos) {
      const t = readFileSync(join(DIR, f), 'utf8');
      expect(t, f).not.toMatch(/Paciente (?!Demo)/);
    }
  });
});
