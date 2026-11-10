import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

/** Fábrica compartida por main.ts y las pruebas e2e. */
export async function crearApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  // Cabeceras de seguridad (informe 13.2). CSP/HSTS finos se afinan en S6.
  app.use(helmet());
  return app;
}
