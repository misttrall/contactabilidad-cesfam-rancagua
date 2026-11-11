import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface OpcionesLimite {
  /** Nombre del límite (aparece en el mensaje y separa los contadores). */
  nombre: string;
  ventanaMs: number;
  max: number;
  /** Qué se cuenta: por defecto la IP del cliente. */
  clave?: (req: Request) => string;
  /** Reloj inyectable (pruebas). */
  ahora?: () => number;
}

interface Contador {
  desde: number;
  n: number;
}

/**
 * Límite de tasa de ventana fija, en memoria. Suficiente para una sola instancia (el piloto);
 * con varias instancias hay que pasarlo a Redis (ver docs/mvp/OPERACION.md).
 * No guarda nada personal: la clave es la IP (o el id de usuario) y se descarta al vencer la ventana.
 */
export function limitarTasa(op: OpcionesLimite): RequestHandler & { reiniciar(): void } {
  const ahora = op.ahora ?? Date.now;
  const contadores = new Map<string, Contador>();
  let ultimaLimpieza = ahora();

  const limpiar = (t: number) => {
    if (t - ultimaLimpieza < op.ventanaMs) return;
    ultimaLimpieza = t;
    for (const [k, c] of contadores) if (t - c.desde >= op.ventanaMs) contadores.delete(k);
  };

  const mw = ((req: Request, res: Response, next: NextFunction) => {
    const t = ahora();
    limpiar(t);
    const clave = op.clave ? op.clave(req) : (req.ip ?? 'desconocida');
    let c = contadores.get(clave);
    if (!c || t - c.desde >= op.ventanaMs) {
      c = { desde: t, n: 0 };
      contadores.set(clave, c);
    }
    c.n += 1;
    const restantes = Math.max(0, op.max - c.n);
    const reinicioS = Math.ceil((c.desde + op.ventanaMs - t) / 1000);
    res.setHeader('RateLimit-Limit', String(op.max));
    res.setHeader('RateLimit-Remaining', String(restantes));
    res.setHeader('RateLimit-Reset', String(reinicioS));
    if (c.n > op.max) {
      res.setHeader('Retry-After', String(reinicioS));
      res.status(429).json({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Demasiadas solicitudes (${op.nombre}). Espera ${reinicioS} s e intenta de nuevo.`,
      });
      return;
    }
    next();
  }) as RequestHandler & { reiniciar(): void };
  mw.reiniciar = () => contadores.clear();
  return mw;
}
