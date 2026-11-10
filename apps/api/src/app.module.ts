import { Controller, Get, Module } from '@nestjs/common';
import { construirCapabilityStatement } from '@bh/fhir';
import { cargarConfig } from './config';

const config = cargarConfig();

@Controller('health')
export class SaludController {
  @Get()
  estado() {
    // Sin datos de pacientes ni secretos: solo para balanceadores y CI.
    return { estado: 'ok', ambiente: config.ambiente, version: config.version };
  }
}

@Controller('fhir/R4')
export class FhirController {
  @Get('metadata')
  metadata() {
    return construirCapabilityStatement({
      version: config.version,
      fecha: new Date().toISOString(),
      baseUrl: `${config.baseUrl}/fhir/R4`,
    });
  }
}

@Module({ controllers: [SaludController, FhirController] })
export class AppModule {}
