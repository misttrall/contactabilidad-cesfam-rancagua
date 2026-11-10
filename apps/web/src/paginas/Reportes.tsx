import { Download } from 'lucide-react';
import { useState } from 'react';
import { ETIQUETA_ESTADO, type EstadoCita } from '@bh/shared';
import {
  exportarReporte,
  useCentros,
  useMe,
  useResumenReporte,
  type FilaConfirmacion2,
} from '../api/consultas';

const ESTADOS: EstadoCita[] = ['confirmado', 'enviado', 'sin_enviar', 'sin_respuesta', 'cancelado'];

/** Fecha de hoy en Chile menos `dias` (AAAA-MM-DD). */
function fechaChile(dias = 0): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const [a, m, d] = hoy.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}
const pct = (v: number | null) => (v === null ? 'Sin datos' : `${String(v).replace('.', ',')} %`);

/** Barra apilada por estado; el texto de cada tramo está en la tabla de al lado (no solo color). */
function BarraEstados({ fila }: { fila: Omit<FilaConfirmacion2, 'centro' | 'nombre'> }) {
  if (fila.total === 0) return null;
  return (
    <div className="barra-estados" aria-hidden="true">
      {ESTADOS.map((e) =>
        fila[e] > 0 ? (
          <span
            key={e}
            className={`barra-estados__tramo barra-estados__tramo--${e}`}
            style={{ flexGrow: fila[e] }}
            title={`${ETIQUETA_ESTADO[e]}: ${fila[e]}`}
          />
        ) : null,
      )}
    </div>
  );
}

export function Reportes() {
  const me = useMe().data;
  const centros = useCentros();
  const [centro, setCentro] = useState('');
  const [desde, setDesde] = useState(() => fechaChile(29));
  const [hasta, setHasta] = useState(() => fechaChile(0));
  const [exportando, setExportando] = useState(false);
  const [errorExport, setErrorExport] = useState<string | null>(null);
  const filtros = { centro, desde, hasta };
  const r = useResumenReporte(filtros);
  if (!me) return null;

  const rangoInvalido = desde === '' || hasta === '' || desde > hasta;
  const exportar = async () => {
    setExportando(true);
    setErrorExport(null);
    try {
      const blob = await exportarReporte(filtros);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-contactabilidad_${desde}_${hasta}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorExport(e instanceof Error ? e.message : 'No se pudo generar el archivo');
    } finally {
      setExportando(false);
    }
  };
  const d = r.data;
  const p = d?.piloto;

  return (
    <section className="pagina" aria-labelledby="t-rep">
      <h1 id="t-rep">Reportes</h1>

      <div className="filtros">
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="r-centro">
            Centro
          </label>
          <select
            id="r-centro"
            className="bh-input"
            value={me.centro ? me.centro.codigo : centro}
            disabled={me.centro !== null}
            onChange={(e) => setCentro(e.target.value)}
          >
            <option value="">Todos los centros</option>
            {centros.data?.map((c) => (
              <option key={c.id} value={c.codigo}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="r-desde">
            Desde
          </label>
          <input
            id="r-desde"
            type="date"
            className="bh-input"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="r-hasta">
            Hasta
          </label>
          <input
            id="r-hasta"
            type="date"
            className="bh-input"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        <button
          className="bh-boton bh-boton--secundario"
          disabled={rangoInvalido || exportando}
          onClick={() => void exportar()}
        >
          <Download size={16} strokeWidth={1.75} aria-hidden="true" />{' '}
          {exportando ? 'Generando…' : 'Exportar a Excel'}
        </button>
      </div>
      <p className="texto-secundario">
        Las citas se agrupan por su fecha de atención y las llamadas por el día en que se
        registraron (hora de Chile). El Excel solo contiene cifras agregadas, sin datos de
        pacientes.
      </p>
      {rangoInvalido && (
        <p className="mensaje-error" role="alert">
          La fecha inicial no puede ser posterior a la final.
        </p>
      )}
      {errorExport && (
        <p className="mensaje-error" role="alert">
          {errorExport}
        </p>
      )}
      {r.isPending && !rangoInvalido && <p role="status">Calculando reporte…</p>}
      {r.isError && (
        <p className="mensaje-error" role="alert">
          {r.error.message}
        </p>
      )}

      {d && p && (
        <>
          <h2>Métricas del piloto</h2>
          <div className="datos" aria-label="Métricas del piloto">
            <div className="dato" data-tono="ok">
              <span className="dato__valor tabular">{pct(p.proporcionConfirmadas)}</span>
              <span className="dato__etiqueta">Citas confirmadas</span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">{pct(p.tasaRespuestaWhatsapp)}</span>
              <span className="dato__etiqueta">
                Respondieron por WhatsApp ({p.respondidasPorWhatsapp} de {p.citasConWhatsapp})
              </span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">{p.llamadasEvitadas}</span>
              <span className="dato__etiqueta">
                Llamadas evitadas (≈ {String(p.llamadasEvitadasPorDia).replace('.', ',')} por día)
              </span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">{p.llamadasSalientes}</span>
              <span className="dato__etiqueta">Llamadas salientes</span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">{p.llamadasEntrantes}</span>
              <span className="dato__etiqueta">Llamadas entrantes</span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">
                {p.tiempoRegistroEntrante ? `${p.tiempoRegistroEntrante.mediana} s` : 'Sin datos'}
              </span>
              <span className="dato__etiqueta">
                Tiempo por registro (mediana)
                {p.tiempoRegistroEntrante &&
                  `; ${pct(p.tiempoRegistroEntrante.bajoMeta)} bajo 30 s`}
              </span>
            </div>
          </div>

          <h2>Confirmaciones por centro</h2>
          {d.confirmaciones.porCentro.length === 0 ? (
            <p className="texto-secundario">No hay citas con fecha en este período.</p>
          ) : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Centro</th>
                    <th scope="col">Distribución</th>
                    <th scope="col">Total</th>
                    {ESTADOS.map((e) => (
                      <th scope="col" key={e}>
                        {ETIQUETA_ESTADO[e]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...d.confirmaciones.porCentro,
                    ...(d.confirmaciones.porCentro.length > 1
                      ? [{ centro: '', nombre: 'Total', ...d.confirmaciones.total }]
                      : []),
                  ].map((f) => (
                    <tr key={f.centro || 'total'}>
                      <th scope="row">{f.nombre}</th>
                      <td className="celda-barra">
                        <BarraEstados fila={f} />
                      </td>
                      <td className="tabular">{f.total}</td>
                      {ESTADOS.map((e) => (
                        <td className="tabular" key={e}>
                          {f[e]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>Motivos de llamadas entrantes</h2>
          {d.motivos.filas.length === 0 ? (
            <p className="texto-secundario">No se registraron llamadas en este período.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Motivo</th>
                  <th scope="col">Distribución</th>
                  <th scope="col">Llamadas</th>
                </tr>
              </thead>
              <tbody>
                {d.motivos.filas.map((m) => (
                  <tr key={m.motivo}>
                    <th scope="row">{m.motivo}</th>
                    <td className="celda-barra">
                      <div className="barra-simple" aria-hidden="true">
                        <span
                          style={{ width: `${(m.llamadas / d.motivos.filas[0]!.llamadas) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="tabular">{m.llamadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Llamadas por edad y sexo</h2>
          <p className="texto-secundario">
            Edad que tenía el paciente el día de la llamada. Llamadas sin paciente identificado:{' '}
            {d.edadSexo.sinPacienteIdentificado}.
          </p>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Tramo</th>
                <th scope="col">Mujeres</th>
                <th scope="col">Hombres</th>
                <th scope="col">Sin dato</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.edadSexo.filas.map((f) => (
                <tr key={f.tramo}>
                  <th scope="row">{f.tramo}</th>
                  <td className="tabular">{f.F}</td>
                  <td className="tabular">{f.M}</td>
                  <td className="tabular">{f.sinDato}</td>
                  <td className="tabular">{f.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
