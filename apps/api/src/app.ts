import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { cargarConfig } from './config';

/** Configuración común (la usan main.ts y las pruebas e2e). */
export function configurarApp(app: INestApplication): INestApplication {
  const { origenesWeb } = cargarConfig();
  // Cabeceras de seguridad (informe 13.2). CSP/HSTS finos se afinan en S6.
  app.use(helmet());
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
