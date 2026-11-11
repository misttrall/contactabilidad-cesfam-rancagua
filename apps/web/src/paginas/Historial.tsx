import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { useCentros, useHistorialLlamadas, useMe, useMotivos } from '../api/consultas';

const fechaHora = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Santiago',
});

/** Fecha de hoy en Chile menos `dias` (AAAA-MM-DD). */
function fechaChile(dias = 0): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const [a, m, d] = hoy.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

/** Historial de llamadas entrantes: filtros, búsqueda y paginación en el servidor. */
export function Historial() {
  const me = useMe().data;
  const centros = useCentros();
  const motivos = useMotivos();

  const [centro, setCentro] = useState('');
  const [desde, setDesde] = useState(() => fechaChile(6));
  const [hasta, setHasta] = useState(() => fechaChile(0));
  const [motivoId, setMotivoId] = useState('');
  const [pagina, setPagina] = useState(1);
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');

  const historial = useHistorialLlamadas({
    centro: me?.centro ? '' : centro,
    desde,
    hasta,
    motivoId,
    q,
    pagina,
    tam: 25,
  });
  if (!me) return null;

  /** Cambiar un filtro vuelve a la primera página. */
  const filtrar = (aplicar: () => void) => {
    aplicar();
    setPagina(1);
  };
  const buscar = () => {
    const t = texto.trim();
    if (t === '' || t.length >= 2) filtrar(() => setQ(t));
  };
  const h = historial.data;

  return (
    <section className="pagina" aria-labelledby="t-hist">
      <h1 id="t-hist">Historial de llamadas</h1>

      <div className="filtros">
        {!me.centro && (
          <div className="bh-campo">
            <label className="bh-campo__label" htmlFor="h-centro">
              Centro
            </label>
            <select
              id="h-centro"
              className="bh-input"
              value={centro}
              onChange={(e) => filtrar(() => setCentro(e.target.value))}
            >
              <option value="">Todos los centros</option>
              {centros.data?.map((c) => (
                <option key={c.id} value={c.codigo}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="h-desde">
            Desde
          </label>
          <input
            id="h-desde"
            type="date"
            className="bh-input"
            value={desde}
            onChange={(e) => filtrar(() => setDesde(e.target.value))}
          />
        </div>
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="h-hasta">
            Hasta
          </label>
          <input
            id="h-hasta"
            type="date"
            className="bh-input"
            value={hasta}
            onChange={(e) => filtrar(() => setHasta(e.target.value))}
          />
        </div>
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="h-motivo">
            Motivo
          </label>
          <select
            id="h-motivo"
            className="bh-input"
            value={motivoId}
            onChange={(e) => filtrar(() => setMotivoId(e.target.value))}
          >
            <option value="">Todos</option>
            {motivos.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.descripcion}
              </option>
            ))}
          </select>
        </div>
        <form
          className="bh-campo"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            buscar();
          }}
        >
          <label className="bh-campo__label" htmlFor="h-q">
            RUT o nombre
          </label>
          <span className="fila">
            <input
              id="h-q"
              className="bh-input"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <button type="submit" className="bh-boton bh-boton--secundario" aria-label="Buscar">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" /> Buscar
            </button>
          </span>
        </form>
      </div>

      {historial.isError && (
        <p className="mensaje-error" role="alert">
          {historial.error.message}
        </p>
      )}
      {h && h.total === 0 && (
        <p className="texto-secundario" role="status">
          No hay llamadas con esos filtros.
        </p>
      )}
      {h && h.total > 0 && (
        <>
          <p className="texto-secundario" aria-live="polite">
            {h.total} {h.total === 1 ? 'llamada' : 'llamadas'} · página {h.pagina} de {h.paginas}
          </p>
          <div
            className="tabla-scroll"
            role="region"
            tabIndex={0}
            aria-label="Tabla con desplazamiento"
          >
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Fecha y hora</th>
                  {!me.centro && <th scope="col">Centro</th>}
                  <th scope="col">Paciente</th>
                  <th scope="col">RUT</th>
                  <th scope="col">Motivo</th>
                  <th scope="col">Observación</th>
                  <th scope="col">Registrado por</th>
                  <th scope="col">Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {h.filas.map((f) => (
                  <tr key={f.id}>
                    <td className="tabular">{fechaHora.format(new Date(f.creadaEn))}</td>
                    {!me.centro && <td>{f.centro}</td>}
                    <td>{f.paciente ?? <span className="texto-secundario">No cargado</span>}</td>
                    <td className="tabular">{f.rut}</td>
                    <td>
                      {f.motivo}
                      {f.otroMotivo && <span className="motivo-no">{f.otroMotivo}</span>}
                    </td>
                    <td>{f.observacion ?? '—'}</td>
                    <td>{f.registradoPor}</td>
                    <td className="tabular">{f.segundos !== null ? `${f.segundos} s` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="paginador" aria-label="Paginación">
            <button
              className="bh-boton bh-boton--secundario"
              disabled={h.pagina <= 1}
              onClick={() => setPagina(h.pagina - 1)}
            >
              <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" /> Anterior
            </button>
            <button
              className="bh-boton bh-boton--secundario"
              disabled={h.pagina >= h.paginas}
              onClick={() => setPagina(h.pagina + 1)}
            >
              Siguiente <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
