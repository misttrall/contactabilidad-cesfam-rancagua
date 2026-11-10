import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CAMPOS,
  ETIQUETA_COLUMNA,
  MAX_FILAS,
  claveCita,
  enmascararRut,
  enmascararTelefono,
  normalizarTexto,
  procesarMatriz,
  type FilaCarga,
} from '@bh/shared';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CifradoService } from '../cifrado/cifrado.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_BYTES, leerHoja } from './excel';

type Cliente = Prisma.TransactionClient | PrismaService;
type Procesado = Extract<ReturnType<typeof procesarMatriz>, { ok: true }>;

const trozos = <T>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

const fechaDate = (f: string) => new Date(`${f}T00:00:00.000Z`);

export interface ResumenValidacion {
  totalFilas: number;
  /** Filas que se importarían (válidas, sin morbilidad excluida ni repetidas). */
  validas: number;
  citasNuevas: number;
  citasYaCargadas: number;
  excluidasMorbilidad: number;
  repetidasEnArchivo: number;
  erroresTotal: number;
  errores: { fila: number; columna: string; mensaje: string }[];
  columnasReconocidas: string[];
  columnasIgnoradas: string[];
  /** Primeras filas con RUT y teléfono enmascarados, para confirmar el mapeo de columnas. */
  vistaPrevia: {
    paciente: string;
    rut: string;
    telefono: string;
    fecha: string;
    hora: string;
    profesional: string;
    prestacion: string;
    tipo: string;
  }[];
  limites: { maxFilas: number; maxMegabytes: number };
}

export interface ResultadoImportacion {
  cargaId: string;
  filasTotales: number;
  citasCreadas: number;
  citasExistentes: number;
  pacientesNuevos: number;
  pacientesActualizados: number;
  morbilidadExcluida: number;
  repetidasEnArchivo: number;
  erroresTotal: number;
}

@Injectable()
export class CargasService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  async opciones() {
    const p = await this.prisma.parametro.findUnique({
      where: { clave: 'carga.excluir_morbilidad_por_defecto' },
    });
    return {
      excluirMorbilidadPorDefecto: p ? p.valor === true : true,
      maxFilas: MAX_FILAS,
      maxMegabytes: MAX_BYTES / 1024 / 1024,
    };
  }

  /** Lee y valida la planilla. NO escribe nada. */
  async validar(
    centroId: string,
    buffer: Buffer,
    excluirMorbilidad: boolean,
  ): Promise<ResumenValidacion> {
    const r = this.procesar(buffer, excluirMorbilidad);
    const existentes = await this.clavesExistentes(this.prisma, centroId, r.validas);
    const yaCargadas = r.validas.filter((f) => existentes.has(claveCita(f))).length;
    const reconocidas = CAMPOS.filter((c) => r.mapeo.indices[c] !== undefined).map(
      (c) => ETIQUETA_COLUMNA[c],
    );
    return {
      totalFilas: r.totalFilas,
      validas: r.validas.length,
      citasNuevas: r.validas.length - yaCargadas,
      citasYaCargadas: yaCargadas,
      excluidasMorbilidad: r.excluidasMorbilidad,
      repetidasEnArchivo: r.repetidasEnArchivo,
      erroresTotal: r.erroresTotal,
      errores: r.errores,
      columnasReconocidas: reconocidas,
      columnasIgnoradas: r.mapeo.desconocidos,
      vistaPrevia: r.validas.slice(0, 5).map((f) => ({
        paciente: f.paciente,
        rut: enmascararRut(f.rut),
        telefono: enmascararTelefono(f.telefono),
        fecha: f.fecha,
        hora: f.hora,
        profesional: f.profesional,
        prestacion: f.prestacion,
        tipo: f.tipo,
      })),
      limites: { maxFilas: MAX_FILAS, maxMegabytes: MAX_BYTES / 1024 / 1024 },
    };
  }

  /**
   * Importa. Vuelve a validar el archivo (no confía en una validación previa del cliente) y es
   * idempotente: recargar la misma planilla no duplica citas ni reinicia su estado de contacto.
   */
  async importar(
    usuarioId: string,
    centroId: string,
    buffer: Buffer,
    excluirMorbilidad: boolean,
    ip?: string,
  ): Promise<ResultadoImportacion> {
    const r = this.procesar(buffer, excluirMorbilidad);
    if (r.validas.length === 0) {
      throw new BadRequestException(
        'No hay filas válidas para importar. Revisa los errores de la planilla.',
      );
    }

    const resultado = await this.prisma.$transaction(
      async (tx) => {
        // Serializa las cargas de un mismo centro: dos importaciones simultáneas no se pisan.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${centroId}))`;

        const existentes = await this.clavesExistentes(tx, centroId, r.validas);
        const nuevas = r.validas.filter((f) => !existentes.has(claveCita(f)));
        const pacientes = await this.upsertPacientes(tx, r.validas);

        const profesionales = await tx.profesional.findMany({ where: { centroId } });
        const profPorNombre = new Map(profesionales.map((p) => [normalizarTexto(p.nombre), p.id]));

        const carga = await tx.carga.create({
          data: {
            centroId,
            usuarioId,
            filasTotales: r.totalFilas,
            filasValidas: r.validas.length,
            citasCreadas: nuevas.length,
            citasExistentes: r.validas.length - nuevas.length,
            morbilidadExcluida: r.excluidasMorbilidad,
            repetidasEnArchivo: r.repetidasEnArchivo,
            erroresTotal: r.erroresTotal,
            excluyoMorbilidad: excluirMorbilidad,
          },
        });

        const citas = nuevas.map((f) => ({
          id: randomUUID(),
          centroId,
          pacienteId: pacientes.ids.get(f.rut)!,
          profesionalId: profPorNombre.get(normalizarTexto(f.profesional)) ?? null,
          profesionalNombre: f.profesional,
          profesionalClave: normalizarTexto(f.profesional),
          fecha: fechaDate(f.fecha),
          hora: f.hora,
          prestacion: f.prestacion,
          tipo: f.tipo,
          cargaId: carga.id,
        }));
        for (const lote of trozos(citas, 1000)) {
          await tx.cita.createMany({ data: lote });
          await tx.tareaContacto.createMany({ data: lote.map((c) => ({ citaId: c.id })) });
        }

        return {
          cargaId: carga.id,
          filasTotales: r.totalFilas,
          citasCreadas: nuevas.length,
          citasExistentes: r.validas.length - nuevas.length,
          pacientesNuevos: pacientes.nuevos,
          pacientesActualizados: pacientes.actualizados,
          morbilidadExcluida: r.excluidasMorbilidad,
          repetidasEnArchivo: r.repetidasEnArchivo,
          erroresTotal: r.erroresTotal,
        } satisfies ResultadoImportacion;
      },
      { timeout: 120_000, maxWait: 15_000 },
    );

    // Sin RUT, nombres ni teléfonos: solo conteos.
    await this.auditoria.registrar({
      usuarioId,
      accion: 'carga.importar',
      recurso: 'carga',
      recursoId: resultado.cargaId,
      centroId,
      ...(ip ? { ip } : {}),
      detalle: {
        filas: resultado.filasTotales,
        citasCreadas: resultado.citasCreadas,
        citasExistentes: resultado.citasExistentes,
        errores: resultado.erroresTotal,
      },
    });
    return resultado;
  }

  async historial(centroId: string | null) {
    return this.prisma.carga.findMany({
      where: centroId ? { centroId } : {},
      orderBy: { creadaEn: 'desc' },
      take: 10,
      select: {
        id: true,
        creadaEn: true,
        filasTotales: true,
        citasCreadas: true,
        citasExistentes: true,
        erroresTotal: true,
        centro: { select: { codigo: true } },
      },
    });
  }

  // ------------------------------------------------------------------------------- internos

  private procesar(buffer: Buffer, excluirMorbilidad: boolean): Procesado {
    const r = procesarMatriz(leerHoja(buffer), { excluirMorbilidad });
    if (!r.ok) {
      throw new UnprocessableEntityException({
        message: r.error,
        faltantes: r.faltantes.map((c) => ETIQUETA_COLUMNA[c]),
        encabezadosLeidos: r.encabezadosLeidos,
      });
    }
    return r;
  }

  /** Claves (RUT|fecha|hora|profesional) de las citas que ya existen en el centro. */
  private async clavesExistentes(
    cliente: Cliente,
    centroId: string,
    filas: FilaCarga[],
  ): Promise<Set<string>> {
    if (filas.length === 0) return new Set();
    const fechas = filas.map((f) => f.fecha).sort();
    const citas = await cliente.cita.findMany({
      where: {
        centroId,
        fecha: { gte: fechaDate(fechas[0]!), lte: fechaDate(fechas.at(-1)!) },
      },
      select: {
        fecha: true,
        hora: true,
        profesionalClave: true,
        paciente: { select: { rut: true } },
      },
    });
    return new Set(
      citas.map(
        (c) =>
          `${c.paciente.rut}|${c.fecha.toISOString().slice(0, 10)}|${c.hora}|${c.profesionalClave}`,
      ),
    );
  }

  /** Crea pacientes nuevos y actualiza los datos de contacto de los existentes (la planilla es la fuente). */
  private async upsertPacientes(tx: Prisma.TransactionClient, filas: FilaCarga[]) {
    const porRut = new Map<string, FilaCarga>();
    for (const f of filas) porRut.set(f.rut, f); // si se repite el RUT, vale la última fila
    const ruts = [...porRut.keys()];

    const existentes = new Map<string, Awaited<ReturnType<typeof tx.paciente.findMany>>[number]>();
    for (const lote of trozos(ruts, 1000)) {
      for (const p of await tx.paciente.findMany({ where: { rut: { in: lote } } })) {
        existentes.set(p.rut, p);
      }
    }

    const ids = new Map<string, string>();
    const crear: Prisma.PacienteCreateManyInput[] = [];
    let actualizados = 0;

    for (const [rut, f] of porRut) {
      const actual = existentes.get(rut);
      if (!actual) {
        const id = randomUUID();
        ids.set(rut, id);
        crear.push({
          id,
          rut,
          nombre: f.paciente,
          telefonoCifrado: this.cifrado.cifrar(f.telefono),
          telefonoHash: this.cifrado.hashBusqueda(f.telefono),
          ...(f.fechaNacimiento ? { fechaNacimiento: fechaDate(f.fechaNacimiento) } : {}),
          ...(f.sexo ? { sexo: f.sexo } : {}),
        });
        continue;
      }
      ids.set(rut, actual.id);
      const telefonoActual = actual.telefonoCifrado
        ? this.cifrado.descifrar(actual.telefonoCifrado)
        : null;
      const cambios: Prisma.PacienteUpdateInput = {};
      if (actual.nombre !== f.paciente) cambios.nombre = f.paciente;
      if (telefonoActual !== f.telefono || !actual.telefonoHash) {
        cambios.telefonoCifrado = this.cifrado.cifrar(f.telefono);
        cambios.telefonoHash = this.cifrado.hashBusqueda(f.telefono);
      }
      if (
        f.fechaNacimiento &&
        actual.fechaNacimiento?.toISOString().slice(0, 10) !== f.fechaNacimiento
      ) {
        cambios.fechaNacimiento = fechaDate(f.fechaNacimiento);
      }
      if (f.sexo && actual.sexo !== f.sexo) cambios.sexo = f.sexo;
      if (Object.keys(cambios).length > 0) {
        await tx.paciente.update({ where: { id: actual.id }, data: cambios });
        actualizados++;
      }
    }
    for (const lote of trozos(crear, 1000)) await tx.paciente.createMany({ data: lote });
    return { ids, nuevos: crear.length, actualizados };
  }
}
