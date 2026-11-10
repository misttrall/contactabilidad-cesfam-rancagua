-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('funcionaria', 'encargado', 'administrador');

-- CreateTable
CREATE TABLE "centro" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "centro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "keycloakId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "centroId" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoIngreso" TIMESTAMPTZ(6),

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profesional" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "especialidad" TEXT,
    "centroId" UUID NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "profesional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivo_llamada" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "motivo_llamada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametro" (
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "actualizadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoPor" UUID,

    CONSTRAINT "parametro_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" BIGSERIAL NOT NULL,
    "ocurrioEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" UUID,
    "accion" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "recursoId" TEXT,
    "centroId" UUID,
    "ip" TEXT,
    "detalle" JSONB,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "centro_codigo_key" ON "centro"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_keycloakId_key" ON "usuario"("keycloakId");

-- CreateIndex
CREATE INDEX "usuario_centroId_idx" ON "usuario"("centroId");

-- CreateIndex
CREATE INDEX "profesional_centroId_idx" ON "profesional"("centroId");

-- CreateIndex
CREATE UNIQUE INDEX "motivo_llamada_codigo_key" ON "motivo_llamada"("codigo");

-- CreateIndex
CREATE INDEX "audit_event_ocurrioEn_idx" ON "audit_event"("ocurrioEn");

-- CreateIndex
CREATE INDEX "audit_event_usuarioId_idx" ON "audit_event"("usuarioId");

-- CreateIndex
CREATE INDEX "audit_event_accion_idx" ON "audit_event"("accion");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profesional" ADD CONSTRAINT "profesional_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
