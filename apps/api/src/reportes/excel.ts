import { sanitizarCelda } from '@bh/shared';
import * as XLSX from 'xlsx';
import type { ResumenReporte } from './reportes.service';

type Celda = string | number | null;
const limpia = (filas: Celda[][]): Celda[][] => filas.map((f) => f.map((c) => sanitizarCelda(c)));
const pct = (v: number | null): Celda => (v === null ? 'Sin datos' : `${v} %`);

/**
 * Libro Excel del reporte. Contiene SOLO agregados (conteos y tasas): ningún RUT, nombre ni teléfono
 * sale en una exportación, que además queda auditada. Todo texto pasa por `sanitizarCelda` para
 * que un nombre de centro como «=1+1» no se ejecute como fórmula al abrir el archivo.
 */
export function construirLibroReporte(
  r: ResumenReporte,
  nombreCentro: string,
  generado: string,
): Buffer {
  const p = r.piloto;
  const t = p.tiempoRegistroEntrante;

  const resumen: Celda[][] = [
    ['Reporte de contactabilidad - CESFAM Rancagua'],
    ['Período', `${r.filtros.desde} a ${r.filtros.hasta} (${r.filtros.dias} días)`],
    ['Centro', nombreCentro],
    ['Generado', generado],
    [
      'Nota',
      'Este archivo contiene solo cifras agregadas: no incluye datos personales de pacientes.',
    ],
    [],
    ['Indicador', 'Valor'],
    ['Citas en el período', r.confirmaciones.total.total],
    ['Confirmadas', r.confirmaciones.total.confirmado],
    ['Proporción de horas confirmadas', pct(p.proporcionConfirmadas)],
    ['Tasa de respuesta por WhatsApp', pct(p.tasaRespuestaWhatsapp)],
    ['Llamadas evitadas (resueltas por WhatsApp)', p.llamadasEvitadas],
    ['Llamadas evitadas por día', p.llamadasEvitadasPorDia],
    ['Llamadas entrantes registradas', p.llamadasEntrantes],
    ['Llamadas salientes registradas', p.llamadasSalientes],
    ['Tiempo mediano de registro de llamada entrante (s)', t ? t.mediana : 'Sin datos'],
    ['Registros bajo la meta de 30 s', t ? `${t.bajoMeta} %` : 'Sin datos'],
  ];

  const centros: Celda[][] = [
    [
      'Centro',
      'Nombre',
      'Total',
      'Sin enviar',
      'Enviado',
      'Confirmado',
      'Sin respuesta',
      'Cancelado',
    ],
    ...r.confirmaciones.porCentro.map((c) => [
      c.centro,
      c.nombre,
      c.total,
      c.sin_enviar,
      c.enviado,
      c.confirmado,
      c.sin_respuesta,
      c.cancelado,
    ]),
    [
      'Total',
      '',
      r.confirmaciones.total.total,
      r.confirmaciones.total.sin_enviar,
      r.confirmaciones.total.enviado,
      r.confirmaciones.total.confirmado,
      r.confirmaciones.total.sin_respuesta,
      r.confirmaciones.total.cancelado,
    ],
  ];

  const motivos: Celda[][] = [
    ['Motivo', 'Llamadas'],
    ...r.motivos.filas.map((m) => [m.motivo, m.llamadas]),
    ['Total', r.motivos.total],
  ];

  const edad: Celda[][] = [
    ['Tramo de edad', 'Masculino', 'Femenino', 'Sin dato de sexo', 'Total'],
    ...r.edadSexo.filas.map((e) => [e.tramo, e.M, e.F, e.sinDato, e.total]),
    ['Paciente no identificado', '', '', '', r.edadSexo.sinPacienteIdentificado],
  ];

  const libro = XLSX.utils.book_new();
  const agregar = (nombre: string, filas: Celda[][], anchos: number[]) => {
    const hoja = XLSX.utils.aoa_to_sheet(limpia(filas));
    hoja['!cols'] = anchos.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  };
  agregar('Resumen', resumen, [52, 44]);
  agregar('Confirmaciones por centro', centros, [10, 28, 10, 12, 10, 12, 14, 11]);
  agregar('Motivos de llamada', motivos, [38, 12]);
  agregar('Edad y sexo', edad, [26, 12, 12, 18, 10]);
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
