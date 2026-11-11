import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { SesionUsuario } from '@bh/shared';
import { z } from 'zod';
import { RequiereModulo, Sesion, type RequestConSesion } from '../auth/decoradores';
import { PrivacidadService } from './privacidad.service';

function parsear<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, valor: unknown): T {
  const r = schema.safeParse(valor);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}
const uuid = (id: string) => {
  if (!z.string().uuid().safeParse(id).success)
    throw new NotFoundException('Paciente no encontrado');
  return id;
};

const retencionSchema = z
  .object({
    simular: z.boolean().default(true),
    confirmacion: z.string().optional(),
  })
  .strict()
  .refine((d) => d.simular || d.confirmacion === 'ANONIMIZAR', {
    message: 'Escribe ANONIMIZAR para confirmar',
  });
const suprimirSchema = z
  .object({
    motivo: z.string().trim().min(5, 'Indica el motivo (p. ej. folio de la solicitud)').max(200),
    confirmacion: z.literal('SUPRIMIR', {
      errorMap: () => ({ message: 'Escribe SUPRIMIR para confirmar' }),
    }),
  })
  .strict();

/**
 * Derechos del titular (ARCO+) y política de retención. Solo administrador: quien atiende la
 * solicitud verifica antes la identidad del titular (docs/mvp/privacidad/PROCEDIMIENTO_ARCO.md).
 * Cada acción queda en la bitácora de auditoría (sin RUT ni nombre).
 */
@Controller('api/config/privacidad')
@RequiereModulo('configuracion')
export class PrivacidadController {
  constructor(@Inject(PrivacidadService) private readonly servicio: PrivacidadService) {}

  @Get()
  estado() {
    return this.servicio.estado();
  }

  @Post('retencion')
  retencion(@Body() body: unknown, @Sesion() s: SesionUsuario, @Req() req: RequestConSesion) {
    const { simular } = parsear(retencionSchema, body ?? {});
    return this.servicio.aplicarRetencion({
      simular,
      usuarioId: s.id,
      ...(req.ip ? { ip: req.ip } : {}),
    });
  }

  @Get('pacientes/:id/datos')
  datos(@Param('id') id: string, @Sesion() s: SesionUsuario, @Req() req: RequestConSesion) {
    return this.servicio.datosDelTitular(uuid(id), s.id, req.ip);
  }

  @Post('pacientes/:id/oposicion')
  oposicion(@Param('id') id: string, @Sesion() s: SesionUsuario, @Req() req: RequestConSesion) {
    return this.servicio.registrarOposicion(uuid(id), s.id, req.ip);
  }

  @Post('pacientes/:id/suprimir')
  suprimir(
    @Param('id') id: string,
    @Body() body: unknown,
    @Sesion() s: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const { motivo } = parsear(suprimirSchema, body);
    return this.servicio.suprimir(uuid(id), s.id, motivo, req.ip);
  }
}
