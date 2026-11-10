/**
 * Puerto de salida hacia WhatsApp. El resto del sistema solo conoce esta interfaz: así el simulador
 * (demo y pruebas) y la Cloud API oficial son intercambiables y la lógica de negocio no cambia.
 */
export interface EnvioPlantilla {
  /** Teléfono en formato internacional sin "+": 56912345678 */
  para: string;
  plantilla: string;
  idioma: string;
  /** Parámetros del cuerpo ({{1}}, {{2}}, ...). */
  parametros: string[];
  /** Payload devuelto cuando el paciente pulsa cada botón de respuesta rápida (en orden). */
  payloadsBotones: string[];
}

export interface EnvioTexto {
  para: string;
  texto: string;
}

export interface CanalMensajeria {
  enviarPlantilla(e: EnvioPlantilla): Promise<{ proveedorId: string }>;
  /** Texto libre: solo válido dentro de las 24 h posteriores a una respuesta del paciente. */
  enviarTexto(e: EnvioTexto): Promise<{ proveedorId: string }>;
}

/**
 * Error del canal. `permanente` distingue lo que no vale la pena reintentar (número inexistente,
 * plantilla rechazada, token inválido) de lo transitorio (límite de tasa, caída del proveedor).
 */
export class ErrorCanal extends Error {
  constructor(
    mensaje: string,
    readonly permanente: boolean,
    readonly codigo: string,
  ) {
    super(mensaje);
    this.name = 'ErrorCanal';
  }
}

/** +56 9 1234 5678 -> 56912345678 */
export const telefonoParaWhatsapp = (telefono: string): string => telefono.replace(/\D/g, '');
