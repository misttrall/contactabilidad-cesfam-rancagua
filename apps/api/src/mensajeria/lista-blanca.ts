import {
  ErrorCanal,
  type CanalMensajeria,
  type EnvioPlantilla,
  type EnvioTexto,
  telefonoParaWhatsapp,
} from './canal';

/**
 * Resguardo del ambiente DEMO con WhatsApp REAL: solo se puede escribir a los celulares del equipo
 * (DEMO_TELEFONOS_PRUEBA). Los pacientes de la demo son ficticios y sus números inventados podrían
 * pertenecer a una persona real: jamás debe llegarle un mensaje. Un destino fuera de la lista es un
 * error permanente (no se reintenta) y nunca sale hacia Meta.
 */
export class CanalConListaBlanca implements CanalMensajeria {
  private readonly permitidos: Set<string>;

  constructor(
    private readonly canal: CanalMensajeria,
    telefonos: readonly string[],
  ) {
    this.permitidos = new Set(telefonos.map(telefonoParaWhatsapp));
  }

  private exigir(para: string) {
    if (!this.permitidos.has(telefonoParaWhatsapp(para))) {
      throw new ErrorCanal(
        'DEMO: el número no está en DEMO_TELEFONOS_PRUEBA; no se envía',
        true,
        'DEMO_NO_PERMITIDO',
      );
    }
  }

  async enviarPlantilla(e: EnvioPlantilla) {
    this.exigir(e.para);
    return this.canal.enviarPlantilla(e);
  }

  async enviarTexto(e: EnvioTexto) {
    this.exigir(e.para);
    return this.canal.enviarTexto(e);
  }
}
