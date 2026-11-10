-- CreateEnum
CREATE TYPE "TipoMensaje" AS ENUM ('confirmacion', 'recordatorio', 'reagendamiento');

-- CreateEnum
CREATE TYPE "EstadoMensaje" AS ENUM ('en_cola', 'enviado', 'entregado', 'leido', 'fallido');

-- CreateEnum
CREATE TYPE "RespuestaPaciente" AS ENUM ('si', 'no');

-- CreateEnum
CREATE TYPE "FormaContacto" AS ENUM ('whatsapp', 'llamada');

-- AlterTable
ALTER TABLE "paciente" ADD COLUMN     "telefonoHash" TEXT,
ADD COLUMN     "whatsappBaja" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappBajaEn" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "tarea_contacto" ADD COLUMN     "enviadoEn" TIMESTAMPTZ(6),
ADD COLUMN     "formaContacto" "FormaContacto",
ADD COLUMN     "respondidoEn" TIMESTAMPTZ(6),
ADD COLUMN     "respuesta" "RespuestaPaciente";

-- CreateTable
CREATE TABLE "mensaje" (
    "id" UUID NOT NULL,
    "citaId" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "envioId" UUID,
    "tipo" "TipoMensaje" NOT NULL,
    "estado" "EstadoMensaje" NOT NULL DEFAULT 'en_cola',
    "plantilla" TEXT NOT NULL,
    "proveedorId" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "errorCodigo" TEXT,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "programadoPara" TIMESTAMPTZ(6),
    "enviadoEn" TIMESTAMPTZ(6),
    "entregadoEn" TIMESTAMPTZ(6),
    "leidoEn" TIMESTAMPTZ(6),
    "fallidoEn" TIMESTAMPTZ(6),

    CONSTRAINT "mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envio" (
    "id" UUID NOT NULL,
    "centroId" UUID NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solicitadas" INTEGER NOT NULL,
    "encoladas" INTEGER NOT NULL,
    "omitidasSinTelefono" INTEGER NOT NULL,
    "omitidasBaja" INTEGER NOT NULL,
    "omitidasEstado" INTEGER NOT NULL,

    CONSTRAINT "envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensaje_entrante" (
    "id" UUID NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "recibidoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultado" TEXT NOT NULL,
    "citaId" UUID,

    CONSTRAINT "mensaje_entrante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liberacion" (
    "id" UUID NOT NULL,
    "citaId" UUID NOT NULL,
    "creadaEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltaEn" TIMESTAMPTZ(6),
    "resueltaPor" TEXT,

    CONSTRAINT "liberacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consentimiento" (
    "id" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "registradoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consentimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mensaje_proveedorId_key" ON "mensaje"("proveedorId");

-- CreateIndex
CREATE INDEX "mensaje_envioId_idx" ON "mensaje"("envioId");

-- CreateIndex
CREATE INDEX "mensaje_estado_idx" ON "mensaje"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "mensaje_citaId_tipo_key" ON "mensaje"("citaId", "tipo");

-- CreateIndex
CREATE INDEX "envio_centroId_creadoEn_idx" ON "envio"("centroId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "mensaje_entrante_proveedorId_key" ON "mensaje_entrante"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "liberacion_citaId_key" ON "liberacion"("citaId");

-- CreateIndex
CREATE INDEX "liberacion_resueltaEn_idx" ON "liberacion"("resueltaEn");

-- CreateIndex
CREATE INDEX "consentimiento_pacienteId_idx" ON "consentimiento"("pacienteId");

-- CreateIndex
CREATE INDEX "paciente_telefonoHash_idx" ON "paciente"("telefonoHash");

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "cita"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "envio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio" ADD CONSTRAINT "envio_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liberacion" ADD CONSTRAINT "liberacion_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "cita"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimiento" ADD CONSTRAINT "consentimiento_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
