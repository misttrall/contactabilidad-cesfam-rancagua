import { ErrorCanal, type CanalMensajeria, type EnvioPlantilla, type EnvioTexto } from './canal';

export interface OpcionesCloudApi {
  token: string;
  phoneNumberId: string;
  apiVersion: string;
  /** Inyectable para pruebas. */
  fetchFn?: typeof fetch;
  /** Tiempo máximo por llamada (ms). */
  timeoutMs?: number;
}

/**
 * Cliente de la WhatsApp Business Platform (Cloud API de Meta).
 * Los errores 4xx (salvo 429) son permanentes; 429, 5xx y fallas de red son transitorios y la cola
 * los reintenta con espera creciente.
 */
export class CloudApiWhatsApp implements CanalMensajeria {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly o: OpcionesCloudApi) {
    this.fetchFn = o.fetchFn ?? fetch;
  }

  private get url() {
    return `https://graph.facebook.com/${this.o.apiVersion}/${this.o.phoneNumberId}/messages`;
  }

  enviarPlantilla(e: EnvioPlantilla) {
    return this.enviar({
      messaging_product: 'whatsapp',
      to: e.para,
      type: 'template',
      template: {
        name: e.plantilla,
        language: { code: e.idioma },
        components: [
          { type: 'body', parameters: e.parametros.map((text) => ({ type: 'text', text })) },
          // Cada botón devuelve su payload al webhook: así la respuesta se asocia a la cita.
          ...e.payloadsBotones.map((payload, index) => ({
            type: 'button',
            sub_type: 'quick_reply',
            index: String(index),
            parameters: [{ type: 'payload', payload }],
          })),
        ],
      },
    });
  }

  enviarTexto(e: EnvioTexto) {
    return this.enviar({
      messaging_product: 'whatsapp',
      to: e.para,
      type: 'text',
      text: { body: e.texto, preview_url: false },
    });
  }

  private async enviar(cuerpo: unknown): Promise<{ proveedorId: string }> {
    let res: Response;
    try {
      res = await this.fetchFn(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.o.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(this.o.timeoutMs ?? 15_000),
      });
    } catch {
      // Red caída o tiempo agotado: transitorio. No se incluye el cuerpo (lleva el teléfono).
      throw new ErrorCanal('No se pudo contactar a WhatsApp', false, 'RED');
    }

    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as {
        error?: { code?: number; message?: string };
      };
      const codigo = String(e.error?.code ?? res.status);
      const transitorio = res.status === 429 || res.status >= 500;
      // El mensaje del proveedor puede citar el número: solo se conserva el código.
      throw new ErrorCanal(
        `WhatsApp respondió ${res.status} (código ${codigo})`,
        !transitorio,
        codigo,
      );
    }
    const ok = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
    const proveedorId = ok.messages?.[0]?.id;
    // Podría haberse enviado igual: reintentar arriesga duplicar el mensaje, así que no se reintenta.
    if (!proveedorId) {
      throw new ErrorCanal('Respuesta de WhatsApp sin id de mensaje', true, 'SIN_ID');
    }
    return { proveedorId };
  }
}
