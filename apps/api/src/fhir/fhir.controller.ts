import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  CODESYSTEMS_ESTATICOS,
  bundleSearchset,
  codeSystemMotivos,
  construirCapabilityStatement,
  operationOutcome,
  organizacionAFhir,
  practitionerAFhir,
  practitionerRoleAFhir,
  ubicacionAFhir,
} from '@bh/fhir';
import { resolverAlcance, type SesionUsuario } from '@bh/shared';
import { Publico, Sesion } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';
import { CONFIG } from '../tokens';
import type { Config } from '../config';

const FHIR_JSON = 'application/fhir+json; charset=utf-8';

/**
 * Fachada FHIR R4 (ADR-001 §2.3). S1: recursos de referencia (centros, profesionales, códigos).
 * Los errores devuelven OperationOutcome en el cuerpo.
 */
@Controller('fhir/R4')
export class FhirController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  private get base() {
    return `${this.config.baseUrl}/fhir/R4`;
  }

  /** CapabilityStatement público por convención FHIR. */
  @Get('metadata')
  @Publico()
  @Header('Content-Type', FHIR_JSON)
  metadata() {
    return construirCapabilityStatement({
      version: this.config.version,
      fecha: new Date().toISOString(),
      baseUrl: this.base,
    });
  }

  @Get('Organization')
  @Header('Content-Type', FHIR_JSON)
  async organizaciones(@Sesion() s: SesionUsuario) {
    const centros = await this.centrosVisibles(s);
    return bundleSearchset(centros.map(organizacionAFhir), this.base);
  }

  @Get('Organization/:id')
  @Header('Content-Type', FHIR_JSON)
  async organizacion(@Param('id') id: string, @Sesion() s: SesionUsuario) {
    return organizacionAFhir(await this.centroVisible(id, s));
  }

  @Get('Location')
  @Header('Content-Type', FHIR_JSON)
  async ubicaciones(@Sesion() s: SesionUsuario) {
    const centros = await this.centrosVisibles(s);
    return bundleSearchset(centros.map(ubicacionAFhir), this.base);
  }

  @Get('Location/:id')
  @Header('Content-Type', FHIR_JSON)
  async ubicacion(@Param('id') id: string, @Sesion() s: SesionUsuario) {
    return ubicacionAFhir(await this.centroVisible(id, s));
  }

  @Get('Practitioner')
  @Header('Content-Type', FHIR_JSON)
  async profesionales(@Sesion() s: SesionUsuario, @Query('organization') org?: string) {
    const profs = await this.profesionalesVisibles(s, org);
    return bundleSearchset(profs.map(practitionerAFhir), this.base);
  }

  @Get('Practitioner/:id')
  @Header('Content-Type', FHIR_JSON)
  async profesional(@Param('id') id: string, @Sesion() s: SesionUsuario) {
    const [p] = (await this.profesionalesVisibles(s)).filter((x) => x.id === id);
    if (!p) throw this.noEncontrado('Practitioner', id);
    return practitionerAFhir(p);
  }

  @Get('PractitionerRole')
  @Header('Content-Type', FHIR_JSON)
  async roles(@Sesion() s: SesionUsuario, @Query('organization') org?: string) {
    const profs = await this.profesionalesVisibles(s, org);
    return bundleSearchset(profs.map(practitionerRoleAFhir), this.base);
  }

  @Get('PractitionerRole/:id')
  @Header('Content-Type', FHIR_JSON)
  async rol(@Param('id') id: string, @Sesion() s: SesionUsuario) {
    const [p] = (await this.profesionalesVisibles(s)).filter((x) => x.id === id);
    if (!p) throw this.noEncontrado('PractitionerRole', id);
    return practitionerRoleAFhir(p);
  }

  @Get('CodeSystem/:id')
  @Header('Content-Type', FHIR_JSON)
  async codeSystem(@Param('id') id: string) {
    if (id === 'motivo-llamada') {
      const motivos = await this.prisma.motivoLlamada.findMany({
        where: { activo: true },
        orderBy: { orden: 'asc' },
      });
      return codeSystemMotivos(motivos);
    }
    const f = CODESYSTEMS_ESTATICOS[id];
    if (!f) throw this.noEncontrado('CodeSystem', id);
    return f();
  }

  // ---------------------------------------------------------------- helpers de alcance

  private async centrosVisibles(s: SesionUsuario) {
    const alcance = resolverAlcance(s);
    if (alcance.tipo === 'prohibido') throw this.prohibido(alcance.motivo);
    return this.prisma.centro.findMany({
      where: { ...(alcance.tipo === 'centro' ? { codigo: alcance.centroId } : {}) },
      orderBy: { nombre: 'asc' },
    });
  }

  private async centroVisible(id: string, s: SesionUsuario) {
    const centro = (await this.centrosVisibles(s)).find((c) => c.id === id);
    // Para un centro ajeno respondemos 404, igual que si no existiera (no se revela su existencia).
    if (!centro) throw this.noEncontrado('Organization/Location', id);
    return centro;
  }

  private async profesionalesVisibles(s: SesionUsuario, organizationId?: string) {
    const centros = await this.centrosVisibles(s);
    const ids = centros.map((c) => c.id).filter((id) => !organizationId || id === organizationId);
    return this.prisma.profesional.findMany({
      where: { centroId: { in: ids } },
      orderBy: { nombre: 'asc' },
    });
  }

  private noEncontrado(tipo: string, id: string) {
    return new NotFoundException(
      operationOutcome('error', 'not-found', `${tipo}/${id} no existe o no tienes acceso`),
    );
  }

  private prohibido(motivo: string) {
    return new ForbiddenException(operationOutcome('error', 'forbidden', motivo));
  }
}
