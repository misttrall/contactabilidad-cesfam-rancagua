import { describe, expect, it } from 'vitest';
import {
  dentroDeVentana,
  fechaLarga,
  interpretarTexto,
  parametrosPlantilla,
  parsearPayloadBoton,
  payloadBoton,
  proximoInstanteEnVentana,
  textoConfirmacion,
  textoRecordatorio,
  validarParametro,
} from './mensajeria';

const V = { desde: '09:00', hasta: '18:00' };
const UUID = '0b8f8c52-1e0a-4b46-9a53-6f4a3f0a9d11';

describe('ventana horaria (hora de Chile)', () => {
  // En noviembre Chile está en UTC-3: 12:00Z = 09:00 locales.
  it('dentro y fuera de la ventana', () => {
    expect(dentroDeVentana(new Date('2026-11-20T12:00:00Z'), V)).toBe(true); // 09:00
    expect(dentroDeVentana(new Date('2026-11-20T20:59:00Z'), V)).toBe(true); // 17:59
    expect(dentroDeVentana(new Date('2026-11-20T21:00:00Z'), V)).toBe(false); // 18:00 (límite exclusivo)
    expect(dentroDeVentana(new Date('2026-11-20T08:00:00Z'), V)).toBe(false); // 05:00
  });
  it('fuera de la ventana espera al próximo inicio', () => {
    const noche = new Date('2026-11-20T22:00:00Z'); // 19:00 locales -> mañana 09:00
    expect(proximoInstanteEnVentana(noche, V).toISOString()).toBe('2026-11-21T12:00:00.000Z');
    const madrugada = new Date('2026-11-20T08:00:00Z'); // 05:00 locales -> hoy 09:00
    expect(proximoInstanteEnVentana(madrugada, V).toISOString()).toBe('2026-11-20T12:00:00.000Z');
  });
  it('dentro de la ventana no se retrasa', () => {
    const t = new Date('2026-11-20T15:00:00Z');
    expect(proximoInstanteEnVentana(t, V)).toBe(t);
  });
  it('respeta el cambio de horario de Chile (invierno UTC-4)', () => {
    const noche = new Date('2026-06-15T23:00:00Z'); // 19:00 locales (UTC-4)
    expect(proximoInstanteEnVentana(noche, V).toISOString()).toBe('2026-06-16T13:00:00.000Z');
  });
});

describe('textos de las plantillas', () => {
  const d = { centro: 'CESFAM Centro', fecha: '2026-11-25', hora: '09:30' };
  it('fecha larga en español', () => {
    expect(fechaLarga('2026-11-25')).toMatch(/^miércoles 25 de noviembre$/);
  });
  it('incluyen centro, fecha y hora, y NINGÚN dato clínico ni personal', () => {
    for (const t of [textoConfirmacion(d), textoRecordatorio(d)]) {
      expect(t).toContain('CESFAM Centro');
      expect(t).toContain('25 de noviembre');
      expect(t).toContain('09:30');
      expect(t).not.toMatch(/DM2|HTA|diabetes|hipertens|control cr[oó]nico|Dra\.|Dr\./i);
    }
    expect(parametrosPlantilla(d)).toHaveLength(3);
  });
});

describe('respuestas', () => {
  it('el payload del botón se puede leer de vuelta', () => {
    expect(parsearPayloadBoton(payloadBoton('SI', UUID))).toEqual({
      accion: 'SI',
      mensajeId: UUID,
    });
    expect(parsearPayloadBoton(payloadBoton('BAJA', UUID.toUpperCase()))?.mensajeId).toBe(UUID);
  });
  it('rechaza payloads mal formados o con otra acción', () => {
    expect(parsearPayloadBoton('SI:123')).toBeNull();
    expect(parsearPayloadBoton(`BORRAR:${UUID}`)).toBeNull();
    expect(parsearPayloadBoton(`SI:${UUID};DROP`)).toBeNull();
  });
  it('interpreta texto libre con prudencia', () => {
    expect(interpretarTexto('Sí')).toBe('si');
    expect(interpretarTexto(' SI ')).toBe('si');
    expect(interpretarTexto('No puedo')).toBe('no');
    expect(interpretarTexto('no')).toBe('no');
    expect(interpretarTexto('talvez')).toBeNull();
    expect(interpretarTexto('')).toBeNull();
    expect(interpretarTexto('no sé si podré')).toBeNull(); // ambiguo: que llame la funcionaria
  });
  it('«no quiero recibir más mensajes» es una baja, NO un «no» a la cita', () => {
    expect(interpretarTexto('No quiero recibir más mensajes')).toBe('baja');
    expect(interpretarTexto('STOP')).toBe('baja');
    expect(interpretarTexto('baja')).toBe('baja');
  });
});

describe('parámetros', () => {
  it('valida tipos y rangos', () => {
    expect(validarParametro('envio.anticipacion_horas', 24)).toEqual({ ok: true, valor: 24 });
    expect(validarParametro('envio.anticipacion_horas', 0).ok).toBe(false);
    expect(validarParametro('envio.anticipacion_horas', '24').ok).toBe(false);
    expect(validarParametro('envio.limite_por_segundo', 500).ok).toBe(false);
    expect(validarParametro('envio.segundo_mensaje_adulto_mayor', 'sí').ok).toBe(false);
  });
  it('la ventana debe tener inicio anterior al término y formato HH:mm', () => {
    expect(validarParametro('envio.ventana_horaria', { desde: '09:00', hasta: '18:00' }).ok).toBe(
      true,
    );
    expect(validarParametro('envio.ventana_horaria', { desde: '18:00', hasta: '09:00' }).ok).toBe(
      false,
    );
    expect(validarParametro('envio.ventana_horaria', { desde: '9:00', hasta: '18:00' }).ok).toBe(
      false,
    );
    expect(
      validarParametro('envio.ventana_horaria', { desde: '09:00', hasta: '18:00', x: 1 }).ok,
    ).toBe(false);
  });
  it('rechaza claves desconocidas', () => {
    const r = validarParametro('cualquier.cosa', 1);
    expect(r.ok).toBe(false);
  });
});
