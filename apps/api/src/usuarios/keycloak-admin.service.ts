import {
  BadGatewayException,
  Inject,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { ROLES, type Rol } from '@bh/shared';
import type { Config } from '../config';
import { CONFIG } from '../tokens';

export interface UsuarioKeycloak {
  id: string;
  username: string;
  nombre: string;
  activo: boolean;
  rol: Rol | null;
  /** Código del centro (atributo `centro_id`); null = sin centro. */
  centro: string | null;
}

interface RespuestaUsuario {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  attributes?: Record<string, string[]>;
}

/**
 * Administración de usuarios en Keycloak mediante una cuenta de servicio (client credentials).
 * La identidad (contraseñas, MFA, activación) vive en Keycloak: aquí solo se asigna ROL y CENTRO y se
 * activa o desactiva. Tras cada cambio se cierran las sesiones del usuario para que el siguiente
 * token ya traiga el rol y el centro nuevos.
 */
@Injectable()
export class KeycloakAdminService {
  private token: { valor: string; expira: number } | null = null;
  /** Inyectable para pruebas. */
  fetchFn: typeof fetch = (...a) => fetch(...a);

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  get habilitado(): boolean {
    return this.config.keycloak.admin !== undefined;
  }

  /** Con qué dirección se llega a Keycloak desde la API (en Docker difiere del emisor público). */
  private get emisorInterno() {
    return this.config.keycloak.internalIssuer ?? this.config.keycloak.issuer;
  }

  private get base() {
    // http://kc/realms/x  ->  http://kc/admin/realms/x
    return this.emisorInterno.replace('/realms/', '/admin/realms/');
  }

  private async obtenerToken(): Promise<string> {
    const admin = this.config.keycloak.admin;
    if (!admin) {
      throw new NotImplementedException(
        'La gestión de usuarios no está configurada en este ambiente',
      );
    }
    if (this.token && this.token.expira > Date.now() + 30_000) return this.token.valor;
    const res = await this.llamar(`${this.emisorInterno}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: admin.clientId,
        client_secret: admin.secret,
      }),
    });
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token)
      throw new BadGatewayException('El servicio de identidad no entregó un token');
    this.token = { valor: j.access_token, expira: Date.now() + (j.expires_in ?? 60) * 1000 };
    return j.access_token;
  }

  private async llamar(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new BadGatewayException('No se pudo contactar al servicio de identidad');
    }
    if (res.status === 404) throw new NotFoundException('Usuario no encontrado');
    if (!res.ok) throw new BadGatewayException(`El servicio de identidad respondió ${res.status}`);
    return res;
  }

  private async api(ruta: string, init: RequestInit = {}): Promise<Response> {
    const t = await this.obtenerToken();
    return this.llamar(`${this.base}${ruta}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${t}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  }

  private aUsuario(u: RespuestaUsuario, rol: Rol | null): UsuarioKeycloak {
    const centro = u.attributes?.centro_id?.[0];
    return {
      id: u.id,
      username: u.username,
      nombre: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.username,
      activo: u.enabled,
      rol,
      centro: centro && centro !== '' ? centro : null,
    };
  }

  async listar(): Promise<UsuarioKeycloak[]> {
    const usuarios = (await (await this.api('/users?max=500')).json()) as RespuestaUsuario[];
    // Una consulta por rol (3) en vez de una por usuario.
    const porRol = new Map<string, Rol>();
    for (const rol of ROLES) {
      const miembros = (await (await this.api(`/roles/${rol}/users?max=500`)).json()) as {
        id: string;
      }[];
      for (const m of miembros) porRol.set(m.id, rol);
    }
    return usuarios
      .map((u) => this.aUsuario(u, porRol.get(u.id) ?? null))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  async obtener(id: string): Promise<UsuarioKeycloak> {
    const u = (await (await this.api(`/users/${id}`)).json()) as RespuestaUsuario;
    const asignados = (await (await this.api(`/users/${id}/role-mappings/realm`)).json()) as {
      name: string;
    }[];
    return this.aUsuario(u, ROLES.find((r) => asignados.some((a) => a.name === r)) ?? null);
  }

  async actualizar(
    id: string,
    cambios: { rol?: Rol; centro?: string | null; activo?: boolean },
  ): Promise<UsuarioKeycloak> {
    const actual = (await (await this.api(`/users/${id}`)).json()) as RespuestaUsuario;

    if (cambios.centro !== undefined || cambios.activo !== undefined) {
      // PUT reemplaza los atributos: se conservan los demás y solo se toca `centro_id`.
      const atributos = { ...(actual.attributes ?? {}) };
      if (cambios.centro !== undefined) {
        if (cambios.centro === null) delete atributos.centro_id;
        else atributos.centro_id = [cambios.centro];
      }
      await this.api(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...actual,
          enabled: cambios.activo ?? actual.enabled,
          attributes: atributos,
        }),
      });
    }

    if (cambios.rol) {
      const todos = await Promise.all(
        ROLES.map(
          async (r) =>
            (await (await this.api(`/roles/${r}`)).json()) as { id: string; name: string },
        ),
      );
      const nuevo = todos.find((r) => r.name === cambios.rol)!;
      const sobran = todos.filter((r) => r.name !== cambios.rol);
      await this.api(`/users/${id}/role-mappings/realm`, {
        method: 'DELETE',
        body: JSON.stringify(sobran),
      });
      await this.api(`/users/${id}/role-mappings/realm`, {
        method: 'POST',
        body: JSON.stringify([nuevo]),
      });
    }

    // El token vigente trae el rol y el centro viejos: se obliga a iniciar sesión de nuevo.
    await this.api(`/users/${id}/logout`, { method: 'POST' });

    const final = (await (await this.api(`/users/${id}`)).json()) as RespuestaUsuario;
    const asignados = (await (await this.api(`/users/${id}/role-mappings/realm`)).json()) as {
      name: string;
    }[];
    const rolFinal = ROLES.find((r) => asignados.some((a) => a.name === r)) ?? null;
    return this.aUsuario(final, rolFinal);
  }
}
