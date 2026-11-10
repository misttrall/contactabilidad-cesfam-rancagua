import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Config } from '../config';
import { CONFIG } from '../tokens';

const VERSION = 'v1';

/**
 * Cifrado AES-256-GCM de datos de contacto. Formato: `v1:<iv>:<tag>:<texto>` (base64).
 * GCM autentica: un valor alterado en la BD falla al descifrar en vez de devolver basura.
 * La versión permite rotar la clave en el futuro.
 */
@Injectable()
export class CifradoService {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.config.claveDatos, iv);
    const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
    return [
      VERSION,
      iv.toString('base64'),
      c.getAuthTag().toString('base64'),
      ct.toString('base64'),
    ].join(':');
  }

  descifrar(valor: string): string {
    const [version, iv, tag, ct] = valor.split(':');
    if (version !== VERSION || !iv || !tag || !ct)
      throw new Error('Formato de dato cifrado no válido');
    const d = createDecipheriv('aes-256-gcm', this.config.claveDatos, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  }

  /**
   * Huella determinista para BUSCAR sin descifrar (p. ej. ubicar al paciente que responde desde un
   * teléfono). HMAC-SHA256 con una clave derivada: sin la clave no se puede invertir ni adivinar.
   */
  hashBusqueda(texto: string): string {
    const clave = Buffer.from(hkdfSync('sha256', this.config.claveDatos, '', 'bh-busqueda-v1', 32));
    return createHmac('sha256', clave).update(texto).digest('hex');
  }
}
