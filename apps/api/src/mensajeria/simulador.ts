import { randomUUID } from 'node:crypto';
import { ErrorCanal, type CanalMensajeria, type EnvioPlantilla, type EnvioTexto } from './canal';

export interface MensajeSimulado {
  tipo: 'plantilla' | 'texto';
  para: string;
  plantilla?: string;
  parametros?: string[];
  payloadsBotones?: string[];
  texto?: string;
  proveedorId: string;
}

/**
 * Canal de demostración y pruebas: no sale nada a internet. Guarda lo "enviado" en memoria
 * (acotado) y permite simular fallas con `fallarSi`.
 */
export class SimuladorWhatsApp implements CanalMensajeria {
  readonly enviados: MensajeSimulado[] = [];
  /** Si devuelve un ErrorCanal para un envío, este falla (p. ej., número sin WhatsApp). */
  fallarSi: (para: string) => ErrorCanal | null = () => null;
  private static readonly MAX = 1000;

  async enviarPlantilla(e: EnvioPlantilla) {
    const falla = this.fallarSi(e.para);
    if (falla) throw falla;
    return this.registrar({
      tipo: 'plantilla',
      para: e.para,
      plantilla: e.plantilla,
      parametros: e.parametros,
      payloadsBotones: e.payloadsBotones,
    });
  }

  async enviarTexto(e: EnvioTexto) {
    const falla = this.fallarSi(e.para);
    if (falla) throw falla;
    return this.registrar({ tipo: 'texto', para: e.para, texto: e.texto });
  }

  private registrar(m: Omit<MensajeSimulado, 'proveedorId'>) {
    const proveedorId = `wamid.SIM.${randomUUID()}`;
    this.enviados.push({ ...m, proveedorId });
    if (this.enviados.length > SimuladorWhatsApp.MAX) this.enviados.shift();
    return { proveedorId };
  }
}
