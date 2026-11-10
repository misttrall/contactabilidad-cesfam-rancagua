import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from './app';
import { cargarConfig } from './config';

describe('API', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await crearApp();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde ok sin datos sensibles', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.estado).toBe('ok');
    expect(JSON.stringify(res.body)).not.toMatch(/password|secret|token/i);
  });

  it('GET /fhir/R4/metadata devuelve un CapabilityStatement FHIR 4.0.1', async () => {
    const res = await request(app.getHttpServer()).get('/fhir/R4/metadata').expect(200);
    expect(res.body.resourceType).toBe('CapabilityStatement');
    expect(res.body.fhirVersion).toBe('4.0.1');
  });

  it('envía cabeceras de seguridad de helmet', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('cargarConfig', () => {
  it('usa DEMO por defecto y rechaza ambientes inválidos', () => {
    expect(cargarConfig({}).ambiente).toBe('DEMO');
    expect(() => cargarConfig({ AMBIENTE: 'PROD' })).toThrow(/AMBIENTE inválido/);
    expect(() => cargarConfig({ API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
});
