import { describe, expect, it } from 'vitest';
import { filaPlanillaSchema, registroLlamadaEntranteSchema, telefonoSchema } from './schemas';
import { PACIENTES_SEMILLA } from './semillas';

const p = PACIENTES_SEMILLA[0];
const filaOk = {
  paciente: p.nombre,
  rut: p.rut,
  telefono: '912345678',
  fecha: '2026-11-20',
  hora: '09:30',
  profesional: 'Dra. Demo',
  prestacion: 'Control crónico',
  tipo: 'cronico',
};

describe('filaPlanillaSchema', () => {
  it('normaliza RUT y teléfono', () => {
    const r = filaPlanillaSchema.safeParse({ ...filaOk, rut: '1.000.001-7', telefono: '+56 9 1234 5678' });
    expect(r.success && r.data.telefono).toBe('+56912345678');
    expect(r.success && r.data.rut).toBe('1000001-7');
  });
  it('rechaza RUT inválido, hora fuera de rango y tipo desconocido', () => {
    const r = filaPlanillaSchema.safeParse({ ...filaOk, rut: '1000001-9', hora: '25:00', tipo: 'otro' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const campos = r.error.issues.map((i) => i.path[0]);
      expect(campos).toEqual(expect.arrayContaining(['rut', 'hora', 'tipo']));
    }
  });
});

describe('telefonoSchema', () => {
  it('acepta celulares y rechaza fijos', () => {
    expect(telefonoSchema.safeParse('912345678').success).toBe(true);
    expect(telefonoSchema.safeParse('722123456').success).toBe(false);
  });
});

describe('registroLlamadaEntranteSchema', () => {
  const base = { rut: p.rut, centroId: 'c1', motivoId: 'm7', esOtros: true };
  it('exige detalle cuando el motivo es Otros', () => {
    expect(registroLlamadaEntranteSchema.safeParse(base).success).toBe(false);
    expect(
      registroLlamadaEntranteSchema.safeParse({ ...base, otroMotivo: 'Consulta general' }).success,
    ).toBe(true);
  });
});
