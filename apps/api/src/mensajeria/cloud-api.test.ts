import { describe, expect, it, vi } from 'vitest';
import { ErrorCanal } from './canal';
import { CloudApiWhatsApp } from './cloud-api';

const respuesta = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const crear = (fetchFn: typeof fetch) =>
  new CloudApiWhatsApp({ token: 'TOKEN', phoneNumberId: '123', apiVersion: 'v21.0', fetchFn });

const envio = {
  para: '56912345678',
  plantilla: 'confirmacion_hora_v1',
  idioma: 'es',
  parametros: ['CESFAM Centro', 'miércoles 25 de noviembre', '09:30'],
  payloadsBotones: ['SI:abc', 'NO:abc'],
};

describe('CloudApiWhatsApp', () => {
  it('envía la plantilla con parámetros y botones de respuesta rápida', async () => {
    const f = vi.fn(async () => respuesta(200, { messages: [{ id: 'wamid.ABC' }] }));
    const r = await crear(f as unknown as typeof fetch).enviarPlantilla(envio);
    expect(r.proveedorId).toBe('wamid.ABC');

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/123/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
    const cuerpo = JSON.parse(String(init.body));
    expect(cuerpo).toMatchObject({
      messaging_product: 'whatsapp',
      to: '56912345678',
      type: 'template',
      template: { name: 'confirmacion_hora_v1', language: { code: 'es' } },
    });
    const comps = cuerpo.template.components;
    expect(comps[0].parameters.map((p: { text: string }) => p.text)).toEqual(envio.parametros);
    expect(comps[1]).toMatchObject({ sub_type: 'quick_reply', index: '0' });
    expect(comps[1].parameters[0].payload).toBe('SI:abc');
    expect(comps[2].parameters[0].payload).toBe('NO:abc');
  });

  it('envía texto libre sin vista previa de enlaces', async () => {
    const f = vi.fn(async () => respuesta(200, { messages: [{ id: 'wamid.T' }] }));
    await crear(f as unknown as typeof fetch).enviarTexto({
      para: '56912345678',
      texto: 'Gracias',
    });
    const cuerpo = JSON.parse(
      String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(cuerpo).toMatchObject({ type: 'text', text: { body: 'Gracias', preview_url: false } });
  });

  it.each([
    [400, 131026, true], // número sin WhatsApp / mensaje no entregable
    [401, 190, true], // token inválido
    [404, 100, true],
    [429, 130429, false], // límite de tasa: reintentar
    [500, 1, false],
    [503, 2, false],
  ])('HTTP %i (código %i): permanente=%s', async (status, code, permanente) => {
    const f = async () => respuesta(status, { error: { code, message: 'texto con +56912345678' } });
    const err = await crear(f as unknown as typeof fetch)
      .enviarPlantilla(envio)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ErrorCanal);
    expect(err.permanente).toBe(permanente);
    expect(err.codigo).toBe(String(code));
    // el mensaje del proveedor (que puede citar el teléfono) no se propaga
    expect(err.message).not.toContain('56912345678');
  });

  it('una falla de red es transitoria', async () => {
    const f = async () => {
      throw new Error('ECONNRESET 56912345678');
    };
    const err = await crear(f as unknown as typeof fetch)
      .enviarPlantilla(envio)
      .catch((e) => e);
    expect(err).toMatchObject({ permanente: false, codigo: 'RED' });
    expect(err.message).not.toContain('56912345678');
  });

  it('una respuesta 200 sin id de mensaje se trata como error', async () => {
    const f = async () => respuesta(200, {});
    const err = await crear(f as unknown as typeof fetch)
      .enviarPlantilla(envio)
      .catch((e) => e);
    expect(err).toMatchObject({ permanente: true, codigo: 'SIN_ID' });
  });
});
