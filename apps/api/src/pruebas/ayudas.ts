import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { AppModule } from '../app.module';
import { configurarApp } from '../app';
import type { VerificadorToken } from '../auth/verificador';
import { PrismaService } from '../prisma/prisma.service';
import { VERIFICADOR_TOKEN } from '../tokens';

export const ISSUER = 'http://localhost:8081/realms/businesshub';
export const AUDIENCE = 'businesshub-api';

/** Emite tokens firmados con una clave local y los verifica igual que producción (emisor, audiencia, RS256). */
export async function crearEmisor() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig', kid: 'test' };
  const jwks = createLocalJWKSet({ keys: [jwk] });

  const verificador: VerificadorToken = {
    async verificar(token) {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['RS256'],
      });
      return payload;
    },
  };

  async function emitir(
    claims: JWTPayload & Record<string, unknown>,
    opciones: { audience?: string; issuer?: string; expira?: string } = {},
  ) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(opciones.issuer ?? ISSUER)
      .setAudience(opciones.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(opciones.expira ?? '5m')
      .sign(privateKey);
  }
  return { verificador, emitir };
}

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ids = {
  centroCSC: UUID(1),
  centroCSN: UUID(2),
  motivo1: UUID(11),
  userFuncionaria: UUID(101),
  userEncargado: UUID(102),
  userAdmin: UUID(103),
  userSinRol: UUID(104),
  userSinCentro: UUID(105),
};

/** Base de datos en memoria: solo lo que usan los controladores. Registra la auditoría. */
export function crearPrismaFalso() {
  const centros = [
    { id: ids.centroCSC, codigo: 'CSC', nombre: 'CESFAM Centro (DEMO)', activo: true },
    { id: ids.centroCSN, codigo: 'CSN', nombre: 'CESFAM Norte (DEMO)', activo: true },
  ];
  const profesionales = [
    {
      id: UUID(21),
      nombre: 'Dra. Demo Uno',
      especialidad: 'Medicina general',
      centroId: ids.centroCSC,
      activo: true,
    },
    {
      id: UUID(22),
      nombre: 'Dr. Demo Dos',
      especialidad: null,
      centroId: ids.centroCSN,
      activo: true,
    },
  ];
  const motivos = [
    {
      id: ids.motivo1,
      codigo: 'SOL_HORA',
      descripcion: 'Solicitud de hora',
      orden: 0,
      activo: true,
    },
  ];
  const auditoria: Record<string, unknown>[] = [];

  const porCodigo = (w?: { codigo?: string }) =>
    centros.filter((c) => !w?.codigo || c.codigo === w.codigo);

  const falso = {
    centro: {
      findMany: async ({ where }: { where?: { codigo?: string } } = {}) => porCodigo(where),
      findUnique: async ({ where }: { where: { codigo: string } }) =>
        centros.find((c) => c.codigo === where.codigo) ?? null,
    },
    profesional: {
      findMany: async ({
        where,
      }: { where?: { centroId?: { in: string[] }; centro?: { codigo: string } } } = {}) =>
        profesionales
          .filter((p) => !where?.centroId || where.centroId.in.includes(p.centroId))
          .filter(
            (p) =>
              !where?.centro ||
              centros.find((c) => c.id === p.centroId)?.codigo === where.centro.codigo,
          )
          .map((p) => ({
            ...p,
            centro: { codigo: centros.find((c) => c.id === p.centroId)!.codigo },
          })),
    },
    parametro: { findUnique: async () => null },
    cita: { findMany: async () => [] },
    carga: { findMany: async () => [] },
    motivoLlamada: {
      findMany: async () => motivos,
      findUnique: async ({ where }: { where: { id: string } }) =>
        motivos.find((m) => m.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const m = motivos.find((x) => x.id === where.id)!;
        Object.assign(m, data);
        return m;
      },
    },
    usuario: {
      findUnique: async () => null,
      upsert: async ({
        create,
      }: {
        create: { keycloakId: string; nombre: string; rol: string; centroId: string | null };
      }) => ({
        id: UUID(900),
        activo: true,
        ...create,
      }),
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditoria.push(data);
        return data;
      },
    },
    onModuleDestroy: async () => undefined,
  };
  return { falso, auditoria, motivos };
}

export async function crearAppDePrueba(): Promise<{
  app: INestApplication;
  emitir: Awaited<ReturnType<typeof crearEmisor>>['emitir'];
  auditoria: Record<string, unknown>[];
  motivos: { activo: boolean; descripcion: string }[];
}> {
  const { verificador, emitir } = await crearEmisor();
  const { falso, auditoria, motivos } = crearPrismaFalso();
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(falso)
    .overrideProvider(VERIFICADOR_TOKEN)
    .useValue(verificador)
    .compile();
  const app = configurarApp(modulo.createNestApplication());
  await app.init();
  return { app, emitir, auditoria, motivos };
}

export const claims = {
  funcionaria: {
    sub: ids.userFuncionaria,
    name: 'Funcionaria Demo',
    realm_access: { roles: ['funcionaria'] },
    centro_id: 'CSC',
  },
  encargado: {
    sub: ids.userEncargado,
    name: 'Encargado Demo',
    realm_access: { roles: ['encargado'] },
  },
  admin: { sub: ids.userAdmin, name: 'Admin Demo', realm_access: { roles: ['administrador'] } },
  sinRol: { sub: ids.userSinRol, name: 'Sin Rol', realm_access: { roles: ['offline_access'] } },
  funcionariaSinCentro: {
    sub: ids.userSinCentro,
    name: 'Sin Centro',
    realm_access: { roles: ['funcionaria'] },
  },
};
