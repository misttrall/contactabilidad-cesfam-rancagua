import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import type { SesionUsuario } from '@bh/shared';
import { z } from 'zod';
import { RequiereModulo, Sesion, type RequestConSesion } from '../auth/decoradores';
import { ParametrosService } from './parametros.service';

const cuerpoSchema = z.object({ valor: z.unknown() }).strict();

@Controller('api/config/parametros')
@RequiereModulo('configuracion')
export class ParametrosController {
  constructor(@Inject(ParametrosService) private readonly parametros: ParametrosService) {}

  @Get()
  listar() {
    return this.parametros.listar();
  }

  @Patch(':clave')
  actualizar(
    @Param('clave') clave: string,
    @Body() body: unknown,
    @Sesion() sesion: SesionUsuario,
    @Req() req: RequestConSesion,
  ) {
    const p = cuerpoSchema.safeParse(body);
    if (!p.success || !('valor' in (body as object))) {
      throw new BadRequestException('Envía { "valor": ... }');
    }
    return this.parametros.actualizar(clave, p.data.valor, sesion.id, req.ip);
  }
}
