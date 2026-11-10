import { Controller, Get, Inject, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditoriaService } from './auditoria/auditoria.service';
import { AuthGuard } from './auth/auth.guard';
import { Publico } from './auth/decoradores';
import { ModuloGuard } from './auth/modulo.guard';
import { crearVerificadorKeycloak } from './auth/verificador';
import { CatalogosController } from './catalogos/catalogos.controller';
import { cargarConfig, type Config } from './config';
import { FhirController } from './fhir/fhir.controller';
import { PrismaService } from './prisma/prisma.service';
import { CONFIG, VERIFICADOR_TOKEN } from './tokens';
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
  controllers: [SaludController, FhirController, MeController, CatalogosController],
  providers: [
    { provide: CONFIG, useFactory: () => cargarConfig() },
    {
      provide: VERIFICADOR_TOKEN,
      inject: [CONFIG],
      useFactory: (c: Config) => crearVerificadorKeycloak(c.keycloak),
    },
    PrismaService,
    AuditoriaService,
    UsuariosService,
    // Orden importa: primero autenticación, luego autorización por módulo.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ModuloGuard },
  ],
})
export class AppModule {}
