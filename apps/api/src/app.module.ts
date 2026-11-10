import { Controller, Get, Inject, Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditoriaService } from './auditoria/auditoria.service';
import { AuthGuard } from './auth/auth.guard';
import { Publico } from './auth/decoradores';
import { ModuloGuard } from './auth/modulo.guard';
import { crearVerificadorKeycloak } from './auth/verificador';
import { CargasController } from './cargas/cargas.controller';
import { CargasService } from './cargas/cargas.service';
import { CatalogosController } from './catalogos/catalogos.controller';
import { CifradoService } from './cifrado/cifrado.service';
import { cargarConfig, type Config } from './config';
import { FhirController } from './fhir/fhir.controller';
import { LlamadasEntrantesService } from './llamadas/llamadas-entrantes.service';
import {
  LlamadasEntrantesController,
  PacientesController,
  PendientesController,
} from './llamadas/llamadas.controller';
import { PendientesService } from './llamadas/pendientes.service';
import { BarridoService } from './mensajeria/barrido.service';
import type { CanalMensajeria } from './mensajeria/canal';
import { CloudApiWhatsApp } from './mensajeria/cloud-api';
import { ColaBullMQ, ColaEnMemoria } from './mensajeria/cola';
import { ConfirmacionesController } from './mensajeria/confirmaciones.controller';
import { EnvioService } from './mensajeria/envio.service';
import { ParametrosController } from './mensajeria/parametros.controller';
import { ParametrosService } from './mensajeria/parametros.service';
import { ProcesadorEnvio } from './mensajeria/procesador.service';
import { RespuestasService } from './mensajeria/respuestas.service';
import { SimuladorWhatsApp } from './mensajeria/simulador';
import { SimulacionService } from './mensajeria/simulacion.service';
import { WebhookController } from './mensajeria/webhook.controller';
import { WebhookService } from './mensajeria/webhook.service';
import { PrismaService } from './prisma/prisma.service';
import { CANAL, COLA_ENVIOS, CONFIG, RELOJ, VERIFICADOR_TOKEN } from './tokens';
import { MeController } from './usuarios/me.controller';
import { UsuariosService } from './usuarios/usuarios.service';

@Controller('health')
export class SaludController {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Get()
  @Publico()
  estado() {
    // Sin datos de pacientes ni secretos: solo para balanceadores y CI.
    return { estado: 'ok', ambiente: this.config.ambiente, version: this.config.version };
  }
}

@Module({
  controllers: [
    SaludController,
    FhirController,
    MeController,
    CatalogosController,
    CargasController,
    ConfirmacionesController,
    ParametrosController,
    WebhookController,
    PendientesController,
    PacientesController,
    LlamadasEntrantesController,
  ],
  providers: [
    { provide: CONFIG, useFactory: () => cargarConfig() },
    {
      provide: VERIFICADOR_TOKEN,
      inject: [CONFIG],
      useFactory: (c: Config) => crearVerificadorKeycloak(c.keycloak),
    },
    { provide: RELOJ, useValue: { ahora: () => new Date() } },
    {
      provide: CANAL,
      inject: [CONFIG],
      useFactory: (c: Config): CanalMensajeria =>
        c.whatsapp.modo === 'cloud'
          ? new CloudApiWhatsApp({
              token: c.whatsapp.token!,
              phoneNumberId: c.whatsapp.phoneNumberId!,
              apiVersion: c.whatsapp.apiVersion,
            })
          : new SimuladorWhatsApp(),
    },
    PrismaService,
    AuditoriaService,
    UsuariosService,
    CifradoService,
    CargasService,
    ParametrosService,
    ProcesadorEnvio,
    {
      // Redis (BullMQ) si hay REDIS_URL; si no, cola en memoria (solo desarrollo y pruebas).
      provide: COLA_ENVIOS,
      inject: [CONFIG, ProcesadorEnvio, ParametrosService],
      useFactory: async (c: Config, procesador: ProcesadorEnvio, parametros: ParametrosService) => {
        if (!c.redisUrl) {
          new Logger('Cola').warn(
            'REDIS_URL no definida: la cola de envíos corre en memoria (solo desarrollo)',
          );
          return new ColaEnMemoria(procesador);
        }
        const limitePorSegundo = await parametros.leer('envio.limite_por_segundo').catch(() => 10);
        return new ColaBullMQ({ redisUrl: c.redisUrl, procesador, limitePorSegundo });
      },
    },
    RespuestasService,
    EnvioService,
    WebhookService,
    SimulacionService,
    BarridoService,
    PendientesService,
    LlamadasEntrantesService,
    // Orden importa: primero autenticación, luego autorización por módulo.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ModuloGuard },
  ],
})
export class AppModule {}
