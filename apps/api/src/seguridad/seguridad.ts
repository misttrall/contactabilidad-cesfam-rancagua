import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { Config } from '../config';
import { limitarTasa } from './limite-tasa';

/**
 * Límites por defecto (por IP, ventana de 1 minuto salvo indicación). Se eligieron holgados para
 * el uso normal (≈150 contactos por funcionaria al día) y cerrados para abuso o fuerza bruta.
 */
export const LIMITES = {
  general: { ventanaMs: 60_000, max: 600 },
  /** Cargas de planilla: operación pesada. */
  cargas: { ventanaMs: 60_000, max: 10 },
  /** Revelar RUT/teléfono: dato sensible; el volumen normal es bajo. */
  revelar: { ventanaMs: 60_000, max: 60 },
  /** Envíos masivos y simulación. */
  envios: { ventanaMs: 60_000, max: 20 },
  /** Exportación de reportes. */
  exportar: { ventanaMs: 60_000, max: 10 },
  /** Webhook de Meta: puede ráfagas grandes; se protege por IP pero con holgura. */
  webhook: { ventanaMs: 60_000, max: 3_000 },
} as const;

/** CSP de la API: responde solo JSON/binario, así que no necesita cargar nada. */
export const CSP_API = {
  defaultSrc: ["'none'"],
  frameAncestors: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'none'"],
} as const;

/** Los datos de pacientes nunca deben quedar en cachés del navegador ni de intermediarios. */
function sinCache(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith('/api') || req.path.startsWith('/fhir')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
}

/** `_format=json` (FHIR): acepta json y application/fhir+json; rechaza otros formatos con 406. */
function formatoFhir(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/fhir')) return next();
  const f = req.query._format;
  if (f === undefined) return next();
  const valor = Array.isArray(f) ? String(f[0]) : String(f);
  if (valor === 'json' || valor === 'application/fhir+json' || valor === 'application/json') {
    return next();
  }
  res
    .status(406)
    .type('application/fhir+json')
    .json({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'not-supported',
          diagnostics: `_format=${valor.slice(0, 40)} no está soportado: solo JSON (application/fhir+json)`,
        },
      ],
    });
}

const porRuta = (prefijo: string, metodo?: string) => (req: Request) =>
  req.path.startsWith(prefijo) && (!metodo || req.method === metodo);

/** Aplica un middleware solo a las rutas que cumplen el predicado. */
function cuando(
  pred: (req: Request) => boolean,
  mw: (req: Request, res: Response, next: NextFunction) => void,
) {
  return (req: Request, res: Response, next: NextFunction) =>
    pred(req) ? mw(req, res, next) : next();
}

/** Endurecimiento HTTP de la API (RNF-06/07, ASVS V14): cabeceras, caché, FHIR y límites de tasa. */
export function aplicarSeguridad(app: INestApplication, config: Config): void {
  // Detrás de proxy/balanceador la IP real viene en X-Forwarded-For; si no, nunca confiar en esa cabecera.
  const saltos = Number(process.env.TRUST_PROXY ?? 0);
  if (Number.isInteger(saltos) && saltos > 0) {
    (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set(
      'trust proxy',
      saltos,
    );
  }
  const enProduccionLike = config.ambiente !== 'DEMO';
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { ...CSP_API } },
      // Solo tiene sentido con https: en DEMO local sobre http el navegador lo ignora igual.
      strictTransportSecurity: enProduccionLike
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
        : false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(sinCache);
  app.use(formatoFhir);

  if (!config.limitesTasa) return;

  const l = (n: keyof typeof LIMITES) => limitarTasa({ nombre: n, ...LIMITES[n] });
  app.use(
    cuando(
      (req) => !req.path.startsWith('/health') && !req.path.startsWith('/webhooks/'),
      limitarTasa({ nombre: 'general', ...LIMITES.general }),
    ),
  );
  app.use(cuando(porRuta('/api/cargas', 'POST'), l('cargas')));
  app.use(cuando((r) => r.method === 'POST' && /\/revelar$/.test(r.path), l('revelar')));
  // Solo crear el envío y la simulación: previsualizar y consultar son de uso normal y frecuente.
  app.use(
    cuando(
      (r) =>
        r.method === 'POST' &&
        (r.path === '/api/envios' || r.path === '/api/envios/simular-respuestas'),
      l('envios'),
    ),
  );
  app.use(cuando(porRuta('/api/reportes/exportar'), l('exportar')));
  app.use(cuando(porRuta('/webhooks/whatsapp'), l('webhook')));
}
