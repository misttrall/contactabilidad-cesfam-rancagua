import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface ResultadoVentana {
  permitido: boolean;
  max: number;
  restantes: number;
  /** Segundos hasta que se reinicia la ventana. */
  reinicioS: number;
}

interface Contador {
  desde: number;
  n: number;
}

/**
 * Contador de ventana fija, en memoria. Suficiente para una sola instancia (el piloto);
 * con varias instancias hay que pasarlo a Redis (ver docs/mvp/OPERACION.md).
 * No guarda nada personal: la clave es la IP (o el id de usuario) y se descarta al vencer la ventana.
 */
export class ContadorVentana {
  private readonly contadores = new Map<string, Contador>();
  private ultimaLimpieza: number;

  constructor(
    readonly ventanaMs: number,
    readonly max: number,
    private readonly ahora: () => number = Date.now,
  ) {
    this.ultimaLimpieza = ahora();
  }

  consumir(clave: string): ResultadoVentana {
    const t = this.ahora();
    if (t - this.ultimaLimpieza >= this.ventanaMs) {
      this.ultimaLimpieza = t;
      for (const [k, c] of this.contadores) {
        if (t - c.desde >= this.ventanaMs) this.contadores.delete(k);
      }
    }
    let c = this.contadores.get(clave);
    if (!c || t - c.desde >= this.ventanaMs) {
      c = { desde: t, n: 0 };
      this.contadores.set(clave, c);
    }
    c.n += 1;
    return {
      permitido: c.n <= this.max,
      max: this.max,
      restantes: Math.max(0, this.max - c.n),
      reinicioS: Math.ceil((c.desde + this.ventanaMs - t) / 1000),
    };
  }

  reiniciar(): void {
    this.contadores.clear();
  }
}

export function cabecerasLimite(res: Pick<Response, 'setHeader'>, r: ResultadoVentana): void {
  res.setHeader('RateLimit-Limit', String(r.max));
  res.setHeader('RateLimit-Remaining', String(r.restantes));
  res.setHeader('RateLimit-Reset', String(r.reinicioS));
  if (!r.permitido) res.setHeader('Retry-After', String(r.reinicioS));
}

export const mensajeLimite = (nombre: string, r: ResultadoVentana) => ({
  statusCode: 429,
  error: 'Too Many Requests',
  message: `Demasiadas solicitudes (${nombre}). Espera ${r.reinicioS} s e intenta de nuevo.`,
});

export interface OpcionesLimite {
  /** Nombre del límite (aparece en el mensaje). */
  nombre: string;
  ventanaMs: number;
  max: number;
  /** Qué se cuenta: por defecto la IP del cliente. */
  clave?: (req: Request) => string;
  /** Reloj inyectable (pruebas). */
  ahora?: () => number;
}

/** Middleware Express por IP (o por la clave indicada). Se usa ANTES de autenticar. */
export function limitarTasa(op: OpcionesLimite): RequestHandler & { reiniciar(): void } {
  const contador = new ContadorVentana(op.ventanaMs, op.max, op.ahora);
  const mw = ((req: Request, res: Response, next: NextFunction) => {
    const r = contador.consumir(op.clave ? op.clave(req) : (req.ip ?? 'desconocida'));
    cabecerasLimite(res, r);
    if (!r.permitido) {
      res.status(429).json(mensajeLimite(op.nombre, r));
      return;
    }
    next();
  }) as RequestHandler & { reiniciar(): void };
  mw.reiniciar = () => contador.reiniciar();
  return mw;
}
