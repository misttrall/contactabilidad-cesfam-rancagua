-- CreateEnum
CREATE TYPE "TipoCita" AS ENUM ('cronico', 'morbilidad');

-- CreateEnum
CREATE TYPE "EstadoContacto" AS ENUM ('sin_enviar', 'enviado', 'confirmado', 'sin_respuesta', 'cancelado');

-- CreateEnum
CREATE TYPE "SubestadoContacto" AS ENUM ('recado', 'no_ubicado');

-- CreateEnum
CREATE TYPE "SexoPaciente" AS ENUM ('M', 'F');

-- CreateTable
CREATE TABLE "paciente" (
    "id" UUID NOT NULL,
    "rut" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefonoCifrado" TEXT,
    "fechaNacimiento" DATE,
    "sexo" "SexoPaciente",
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cita" (
    "id" UUID NOT NULL,
    "centroId" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "profesionalId" UUID,
    "profesionalNombre" TEXT NOT NULL,
    "profesionalClave" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "hora" TEXT NOT NULL,
    "prestacion" TEXT NOT NULL,
    "tipo" "TipoCita" NOT NULL,
    "cargaId" UUID NOT NULL,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarea_contacto" (
    "id" UUID NOT NULL,
    "citaId" UUID NOT NULL,
    "estado" "EstadoContacto" NOT NULL DEFAULT 'sin_enviar',
    "subestado" "SubestadoContacto",
    "actualizadoEn" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tarea_contacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carga" (
    "id" UUID NOT NULL,
    "centroId" UUID NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "creadaEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filasTotales" INTEGER NOT NULL,
    "filasValidas" INTEGER NOT NULL,
    "citasCreadas" INTEGER NOT NULL,
    "citasExistentes" INTEGER NOT NULL,
    "morbilidadExcluida" INTEGER NOT NULL,
    "repetidasEnArchivo" INTEGER NOT NULL,
    "erroresTotal" INTEGER NOT NULL,
    "excluyoMorbilidad" BOOLEAN NOT NULL,

    CONSTRAINT "carga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paciente_rut_key" ON "paciente"("rut");

-- CreateIndex
CREATE INDEX "cita_centroId_fecha_idx" ON "cita"("centroId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "cita_centroId_pacienteId_fecha_hora_profesionalClave_key" ON "cita"("centroId", "pacienteId", "fecha", "hora", "profesionalClave");

-- CreateIndex
CREATE UNIQUE INDEX "tarea_contacto_citaId_key" ON "tarea_contacto"("citaId");

-- CreateIndex
CREATE INDEX "tarea_contacto_estado_idx" ON "tarea_contacto"("estado");

-- CreateIndex
CREATE INDEX "carga_centroId_creadaEn_idx" ON "carga"("centroId", "creadaEn");

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "profesional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_cargaId_fkey" FOREIGN KEY ("cargaId") REFERENCES "carga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_contacto" ADD CONSTRAINT "tarea_contacto_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "cita"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga" ADD CONSTRAINT "carga_centroId_fkey" FOREIGN KEY ("centroId") REFERENCES "centro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
