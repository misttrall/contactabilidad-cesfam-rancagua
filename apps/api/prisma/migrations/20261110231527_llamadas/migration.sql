-- CreateEnum
CREATE TYPE "ResultadoLlamada" AS ENUM ('confirmado', 'recado', 'no_ubicado', 'cancelado');

-- CreateTable
CREATE TABLE "llamada_saliente" (
    "id" UUID NOT NULL,
    "citaId" UUID NOT NULL,
    "resultado" "ResultadoLlamada" NOT NULL,
    "observacion" TEXT,
    "usuarioId" TEXT NOT NULL,
    "creadaEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llamada_saliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llamada_entrante" (
    "id" UUID NOT NULL,
    "centroId" UUID NOT NULL,
    "pacienteId" UUID,
    "rut" TEXT NOT NULL,
    "motivoId" UUID NOT NULL,
    "otroMotivo" TEXT,
    "observacion" TEXT,
    "usuarioId" TEXT NOT NULL,
    "segundos" INTEGER,
    "creadaEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llamada_entrante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llamada_saliente_citaId_creadaEn_idx" ON "llamada_saliente"("citaId", "creadaEn");

-- CreateIndex
CREATE INDEX "llamada_saliente_usuarioId_idx" ON "llamada_saliente"("usuarioId");

-- CreateIndex
CREATE INDEX "llamada_entrante_centroId_creadaEn_idx" ON "llamada_entrante"("centroId", "creadaEn");

-- CreateIndex
CREATE INDEX "llamada_entrante_rut_idx" ON "llamada_entrante"("rut");

-- CreateIndex
CREATE INDEX "llamada_entrante_motivoId_idx" ON "llamada_entrante"("motivoId");

-- AddForeignKey
ALTER TABLE "llamada_saliente" ADD CONSTRAINT "llamada_saliente_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "cita"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llamada_entrante" ADD CONSTRAINT "llamada_entrante_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llamada_entrante" ADD CONSTRAINT "llamada_entrante_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "paciente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llamada_entrante" ADD CONSTRAINT "llamada_entrante_motivoId_fkey" FOREIGN KEY ("motivoId") REFERENCES "motivo_llamada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
