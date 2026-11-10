import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  diasEnRango,
  edadCumplida,
  enmascararRut,
  partesSantiago,
  rangoInstantesSantiago,
  resumenTiempos,
  tasa,
  tramoEtario,
  TRAMOS,
  type FiltrosReporte,
  type Tramo,
} from '@bh/shared';
import { ParametrosService } from '../mensajeria/parametros.service';
import type { Reloj } from '../mensajeria/procesador.service';
import { PrismaService } from '../prisma/prisma.service';
import { RELOJ } from '../tokens';

const ESTADOS = ['sin_enviar', 'enviado', 'confirmado', 'sin_respuesta', 'cancelado'] as const;
type Estado = (typeof ESTADOS)[number];
type Conteo = Record<Estado, number>;
const vacio = (): Conteo => ({
  sin_enviar: 0,
  enviado: 0,
  confirmado: 0,
  sin_respuesta: 0,
  cancelado: 0,
});
const fechaDate = (f: string) => new Date(`${f}T00:00:00.000Z`);
/** Mensajes que sí llegaron a salir hacia WhatsApp (no cuentan los que fallaron ni siguen en cola). */
const SALIDOS = ['enviado', 'entregado', 'leido'] as const;
const MAX_FILAS_EDAD = 50_000;

/**
 * Agregaciones de dashboard y reportes. Las citas se agrupan por su FECHA de atención; las
 * llamadas, por el día calendario chileno en que se registraron. `centroId` null = todos los centros.
 */
@Injectable()
export class ReportesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  /** Tablero operativo de un día de citas (por defecto, la fecha de envío sugerida). */
  async dashboard(centroId: string | null, fechaPedida?: string) {
    const ahora = this.reloj.ahora();
    const hoy = partesSantiago(ahora).fecha;
    const anticipacion = await this.parametros.leer('envio.anticipacion_horas');
    const fecha =
      fechaPedida ?? partesSantiago(new Date(ahora.getTime() + anticipacion * 3_600_000)).fecha;
    const citaDelDia: Prisma.CitaWhereInput = {
      fecha: fechaDate(fecha),
      ...(centroId ? { centroId } : {}),
    };
    const dia = rangoInstantesSantiago(hoy, hoy);
    const alcanceCentro = centroId ? { centroId } : {};

    const [grupos, entrantesHoy, sinRespuesta, liberaciones, proximas, recientes] =
      await Promise.all([
        this.prisma.tareaContacto.groupBy({
          by: ['estado'],
          where: { cita: citaDelDia },
          _count: { _all: true },
        }),
        this.prisma.llamadaEntrante.count({ where: { ...alcanceCentro, creadaEn: dia } }),
        this.prisma.tareaContacto.count({
          where: {
            estado: 'sin_respuesta',
            cita: { fecha: { gte: fechaDate(hoy) }, ...alcanceCentro },
          },
        }),
        this.prisma.liberacion.count({
          where: { resueltaEn: null, ...(centroId ? { cita: { centroId } } : {}) },
        }),
        this.prisma.cita.findMany({
          where: { ...citaDelDia, tarea: { estado: 'sin_enviar' } },
          include: { paciente: { select: { nombre: true } } },
          orderBy: [{ hora: 'asc' }, { id: 'asc' }],
          take: 5,
        }),
        this.prisma.llamadaEntrante.findMany({
          where: alcanceCentro,
          orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
          take: 5,
          include: {
            centro: { select: { codigo: true } },
            motivo: { select: { descripcion: true } },
            paciente: { select: { nombre: true } },
          },
        }),
      ]);

    const c = vacio();
    for (const g of grupos) c[g.estado] = g._count._all;
    return {
      fecha,
      hoy,
      // «Enviadas» es un KPI propio: en el prototipo las citas enviadas se mostraban como canceladas (D-03).
      kpis: {
        cargadas: ESTADOS.reduce((s, e) => s + c[e], 0),
        porEnviar: c.sin_enviar,
        enviadas: c.enviado,
        confirmadas: c.confirmado,
        sinRespuesta: c.sin_respuesta,
        canceladas: c.cancelado,
        llamadasEntrantesHoy: entrantesHoy,
      },
      pendientesPorLlamar: sinRespuesta,
      liberacionesPendientes: liberaciones,
      proximasAConfirmar: proximas.map((p) => ({
        id: p.id,
        hora: p.hora,
        paciente: p.paciente.nombre,
        tipo: p.tipo,
      })),
      llamadasRecientes: recientes.map((l) => ({
        id: l.id,
        creadaEn: l.creadaEn,
        centro: l.centro.codigo,
        paciente: l.paciente?.nombre ?? null,
        rut: enmascararRut(l.rut),
        motivo: l.motivo.descripcion,
      })),
    };
  }

  /** Reporte de gestión del período: confirmaciones por centro, motivos, edad y sexo, y métricas del piloto. */
  async resumen(centroId: string | null, f: FiltrosReporte) {
    const citas = {
      fecha: { gte: fechaDate(f.desde), lte: fechaDate(f.hasta) },
      ...(centroId ? { centroId } : {}),
    };
    const llamadas = {
      creadaEn: rangoInstantesSantiago(f.desde, f.hasta),
      ...(centroId ? { centroId } : {}),
    };
    const dias = diasEnRango(f.desde, f.hasta);

    const porEstadoCentro = await this.prisma.$queryRaw<
      { centroId: string; estado: Estado; n: number }[]
    >(Prisma.sql`
      SELECT c."centroId" AS "centroId", t.estado::text AS estado, count(*)::int AS n
      FROM cita c JOIN tarea_contacto t ON t."citaId" = c.id
      WHERE c.fecha BETWEEN ${fechaDate(f.desde)} AND ${fechaDate(f.hasta)}
      ${centroId ? Prisma.sql`AND c."centroId" = ${centroId}::uuid` : Prisma.empty}
      GROUP BY 1, 2`);

    const [
      centros,
      motivosAgr,
      motivos,
      entrantes,
      conPaciente,
      salientes,
      enviadas,
      respondidas,
      evitadas,
    ] = await Promise.all([
      this.prisma.centro.findMany({
        select: { id: true, codigo: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.llamadaEntrante.groupBy({
        by: ['motivoId'],
        where: llamadas,
        _count: { _all: true },
      }),
      this.prisma.motivoLlamada.findMany({ select: { id: true, descripcion: true } }),
      this.prisma.llamadaEntrante.findMany({
        where: { ...llamadas, segundos: { not: null } },
        select: { segundos: true },
      }),
      this.prisma.llamadaEntrante.findMany({
        where: { ...llamadas, pacienteId: { not: null } },
        select: { creadaEn: true, paciente: { select: { fechaNacimiento: true, sexo: true } } },
        take: MAX_FILAS_EDAD,
      }),
      this.prisma.llamadaSaliente.count({
        where: { creadaEn: llamadas.creadaEn, ...(centroId ? { cita: { centroId } } : {}) },
      }),
      this.prisma.cita.count({
        where: {
          ...citas,
          mensajes: { some: { tipo: 'confirmacion', estado: { in: [...SALIDOS] } } },
        },
      }),
      this.prisma.cita.count({
        where: {
          ...citas,
          mensajes: { some: { tipo: 'confirmacion', estado: { in: [...SALIDOS] } } },
          tarea: { respuesta: { not: null }, formaContacto: 'whatsapp' },
        },
      }),
      this.prisma.cita.count({
        where: {
          ...citas,
          tarea: { respuesta: { not: null }, formaContacto: 'whatsapp' },
          llamadas: { none: {} },
        },
      }),
    ]);
    const totalEntrantes = await this.prisma.llamadaEntrante.count({ where: llamadas });

    // ---- confirmaciones por centro
    const porCentro = new Map<string, Conteo>();
    for (const r of porEstadoCentro) {
      const c = porCentro.get(r.centroId) ?? vacio();
      c[r.estado] += r.n;
      porCentro.set(r.centroId, c);
    }
    const confirmacionesPorCentro = centros
      .filter((c) => porCentro.has(c.id))
      .map((c) => {
        const e = porCentro.get(c.id)!;
        return {
          centro: c.codigo,
          nombre: c.nombre,
          total: ESTADOS.reduce((s, k) => s + e[k], 0),
          ...e,
        };
      });
    const total = vacio();
    for (const fila of confirmacionesPorCentro) for (const e of ESTADOS) total[e] += fila[e];
    const citasTotal = ESTADOS.reduce((s, e) => s + total[e], 0);

    // ---- motivos
    const nombreMotivo = new Map(motivos.map((m) => [m.id, m.descripcion]));
    const porMotivo = motivosAgr
      .map((g) => ({
        motivo: nombreMotivo.get(g.motivoId) ?? 'Motivo eliminado',
        llamadas: g._count._all,
      }))
      .sort((a, b) => b.llamadas - a.llamadas || a.motivo.localeCompare(b.motivo));

    // ---- edad y sexo (solo llamadas con paciente identificado; la edad es la que tenía al llamar)
    const matriz = new Map<Tramo, { M: number; F: number; sinDato: number }>(
      TRAMOS.map((t) => [t, { M: 0, F: 0, sinDato: 0 }]),
    );
    for (const l of conPaciente) {
      const nac = l.paciente?.fechaNacimiento?.toISOString().slice(0, 10);
      const edad = nac ? edadCumplida(nac, partesSantiago(l.creadaEn).fecha) : null;
      const celda = matriz.get(tramoEtario(edad))!;
      const sexo = l.paciente?.sexo;
      if (sexo === 'M') celda.M++;
      else if (sexo === 'F') celda.F++;
      else celda.sinDato++;
    }
    const edadSexo = TRAMOS.map((t) => {
      const c = matriz.get(t)!;
      return { tramo: t, ...c, total: c.M + c.F + c.sinDato };
    });

    return {
      filtros: { desde: f.desde, hasta: f.hasta, dias, centro: f.centro ?? null },
      confirmaciones: {
        porCentro: confirmacionesPorCentro,
        total: { ...total, total: citasTotal },
      },
      motivos: { total: totalEntrantes, filas: porMotivo },
      edadSexo: { filas: edadSexo, sinPacienteIdentificado: totalEntrantes - conPaciente.length },
      // Métricas del piloto (informe 14.1)
      piloto: {
        proporcionConfirmadas: tasa(total.confirmado, citasTotal),
        citasConWhatsapp: enviadas,
        tasaRespuestaWhatsapp: tasa(respondidas, enviadas),
        respondidasPorWhatsapp: respondidas,
        llamadasEvitadas: evitadas,
        llamadasEvitadasPorDia: Math.round((evitadas / dias) * 10) / 10,
        llamadasSalientes: salientes,
        llamadasEntrantes: totalEntrantes,
        tiempoRegistroEntrante: resumenTiempos(entrantes.map((e) => e.segundos!)),
      },
    };
  }
}

export type ResumenReporte = Awaited<ReturnType<ReportesService['resumen']>>;
