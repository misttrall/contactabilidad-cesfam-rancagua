import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { cargarConfig } from './config';
import { aplicarSeguridad } from './seguridad/seguridad';

/** Configuración común (la usan main.ts y las pruebas e2e). */
export function configurarApp(app: INestApplication): INestApplication {
  const config = cargarConfig();
  const { origenesWeb } = config;
  // Cabeceras (CSP, HSTS, no-store), formato FHIR y límites de tasa (informe 13.2, S6).
  aplicarSeguridad(app, config);
  app.enableCors({
    origin: origenesWeb,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });
  return app;
}

export async function crearApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    rawBody: true,
  });
  return configurarApp(app);
}
