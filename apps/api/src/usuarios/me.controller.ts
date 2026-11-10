import { Controller, Get, Inject, Req } from '@nestjs/common';
import { ETIQUETA_ROL, modulosPermitidos, type SesionUsuario } from '@bh/shared';
import { Sesion, type RequestConSesion } from '../auth/decoradores';
import { UsuariosService } from './usuarios.service';

@Controller('api/me')
export class MeController {
  constructor(@Inject(UsuariosService) private readonly usuarios: UsuariosService) {}

  /** La web lo llama al iniciar: da el perfil, el centro y los módulos que debe mostrar. */
  @Get()
  async perfil(@Sesion() sesion: SesionUsuario, @Req() req: RequestConSesion) {
    const { usuario, centro, rol } = await this.usuarios.registrarIngreso(sesion, req.ip);
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      rol,
      rolEtiqueta: ETIQUETA_ROL[rol],
      centro: centro ? { id: centro.id, codigo: centro.codigo, nombre: centro.nombre } : null,
      modulos: modulosPermitidos(sesion.roles),
    };
  }
}
