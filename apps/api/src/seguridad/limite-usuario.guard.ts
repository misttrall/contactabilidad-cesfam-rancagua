import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestConSesion } from '../auth/decoradores';
import type { Config } from '../config';
import { CONFIG } from '../tokens';
import { cabecerasLimite, ContadorVentana, mensajeLimite } from './limite-tasa';
import { LIMITES, type NombreLimite } from './limites';

interface Regla {
  nombre: NombreLimite;
  aplica: (metodo: string, ruta: string) => boolean;
}

/**
 * Límites por USUARIO autenticado (corre después de AuthGuard). Contar por IP castigaría a todo un
 * Cesfam: las funcionarias comparten la IP pública del establecimiento. La IP solo se usa antes de
 * autenticar, con un tope alto contra inundación (ver `aplicarSeguridad`).
 * Las reglas específicas se evalúan además del límite general del usuario.
 */
const REGLAS: Regla[] = [
  { nombre: 'cargas', aplica: (m, r) => m === 'POST' && r.startsWith('/api/cargas') },
  { nombre: 'revelar', aplica: (m, r) => m === 'POST' && /\/revelar$/.test(r) },
  {
    nombre: 'envios',
    aplica: (m, r) =>
      m === 'POST' && (r === '/api/envios' || r === '/api/envios/simular-respuestas'),
  },
  { nombre: 'exportar', aplica: (_m, r) => r.startsWith('/api/reportes/exportar') },
];

@Injectable()
export class LimiteUsuarioGuard implements CanActivate {
  private readonly contadores = new Map<NombreLimite, ContadorVentana>(
    (['general', ...REGLAS.map((r) => r.nombre)] as NombreLimite[]).map((n) => [
      n,
      new ContadorVentana(LIMITES[n].ventanaMs, LIMITES[n].max),
    ]),
  );

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.config.limitesTasa) return true;
    const http = ctx.switchToHttp();
    const req = http.getRequest<RequestConSesion>();
    if (!req.sesion) return true; // ruta pública: la cubre el límite por IP
    const res = http.getResponse<Response>();
    const nombres: NombreLimite[] = [
      'general',
      ...REGLAS.filter((r) => r.aplica(req.method, req.path)).map((r) => r.nombre),
    ];
    for (const nombre of nombres) {
      const r = this.contadores.get(nombre)!.consumir(req.sesion.id);
      cabecerasLimite(res, r);
      if (!r.permitido) throw new HttpException(mensajeLimite(nombre, r), 429);
    }
    return true;
  }
}
