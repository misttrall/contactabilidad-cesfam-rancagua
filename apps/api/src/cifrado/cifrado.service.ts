import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Config } from '../config';
import { CONFIG } from '../tokens';

/** Identificador corto de una clave (no la revela: 4 bytes de su SHA-256). */
export function idClave(clave: Buffer): string {
  return createHash('sha256').update(clave).digest('hex').slice(0, 8);
}

/**
 * Cifrado AES-256-GCM de datos de contacto.
 * - Formato actual: `v2:<idClave>:<iv>:<tag>:<texto>` (base64). El id indica con qué clave se cifró.
 * - Formato anterior `v1:<iv>:<tag>:<texto>` (sin id): se descifra probando las claves disponibles.
 * GCM autentica: un valor alterado en la BD falla al descifrar en vez de devolver basura.
 *
 * Rotación: se pone la clave nueva en DATA_ENCRYPTION_KEY y la vieja en
 * DATA_ENCRYPTION_KEY_ANTERIORES; luego `pnpm --filter @bh/api rotar-claves` re-cifra todo.
 */
@Injectable()
export class CifradoService {
  private readonly claves = new Map<string, Buffer>();
  private readonly idActual: string;

  constructor(@Inject(CONFIG) private readonly config: Config) {
    this.idActual = idClave(config.claveDatos);
    this.claves.set(this.idActual, config.claveDatos);
    for (const k of config.clavesDatosAnteriores ?? []) this.claves.set(idClave(k), k);
  }

  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.config.claveDatos, iv);
    const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
    return [
      'v2',
      this.idActual,
      iv.toString('base64'),
      c.getAuthTag().toString('base64'),
      ct.toString('base64'),
    ].join(':');
  }

  descifrar(valor: string): string {
    const partes = valor.split(':');
    if (partes[0] === 'v2' && partes.length === 5) {
      const [, id, iv, tag, ct] = partes as [string, string, string, string, string];
      const clave = this.claves.get(id);
      if (!clave) throw new Error('El dato fue cifrado con una clave que ya no está disponible');
      return this.abrir(clave, iv, tag, ct);
    }
    if (partes[0] === 'v1' && partes.length === 4) {
      const [, iv, tag, ct] = partes as [string, string, string, string];
      for (const clave of this.claves.values()) {
        try {
          return this.abrir(clave, iv, tag, ct);
        } catch {
          // probar la siguiente clave
        }
      }
      throw new Error('No se pudo descifrar el dato con las claves disponibles');
    }
    throw new Error('Formato de dato cifrado no válido');
  }

  /** ¿Está cifrado con una clave o formato distinto del actual? (candidato a re-cifrar) */
  necesitaRotar(valor: string): boolean {
    const p = valor.split(':');
    return !(p[0] === 'v2' && p[1] === this.idActual);
  }

  private abrir(clave: Buffer, iv: string, tag: string, ct: string): string {
    const d = createDecipheriv('aes-256-gcm', clave, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  }

  private huella(clave: Buffer, texto: string): string {
    const derivada = Buffer.from(hkdfSync('sha256', clave, '', 'bh-busqueda-v1', 32));
    return createHmac('sha256', derivada).update(texto).digest('hex');
  }

  /**
   * Huella determinista para BUSCAR sin descifrar (p. ej. ubicar al paciente que responde desde un
   * teléfono). HMAC-SHA256 con una clave derivada: sin la clave no se puede invertir ni adivinar.
   */
  hashBusqueda(texto: string): string {
    return this.huella(this.config.claveDatos, texto);
  }

  /**
   * Huellas con la clave actual Y las anteriores (la actual primero). Para BUSCAR durante una
   * rotación: hasta que `rotar-claves` termine, parte de los pacientes sigue guardada con la huella
   * de la clave vieja.
   */
  hashesBusqueda(texto: string): string[] {
    const claves = [this.config.claveDatos, ...(this.config.clavesDatosAnteriores ?? [])];
    return [...new Set(claves.map((k) => this.huella(k, texto)))];
  }
}
