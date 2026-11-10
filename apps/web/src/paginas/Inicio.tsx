import { PhoneIncoming, PhoneOutgoing, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { EstadoCitaBadge } from '@bh/ui';
import { useCentros, useDashboard, useMe } from '../api/consultas';

// Las rutas se registran en una lista dinámica: se tipan como texto para el enlace.
const RUTA: Record<string, '.'> = {
  pendientes: '/pendientes' as '.',
  confirmaciones: '/confirmaciones' as '.',
};
const hora = new Intl.DateTimeFormat('es-CL', { timeStyle: 'short', timeZone: 'America/Santiago' });
const diaLargo = new Intl.DateTimeFormat('es-CL', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Tablero operativo del día: 7 indicadores, lo que falta por hacer y las últimas llamadas. */
export function Inicio() {
  const me = useMe().data;
  const centros = useCentros();
  const [centro, setCentro] = useState('');
  const [fecha, setFecha] = useState('');
  const d = useDashboard({ centro: me?.centro ? '' : centro, fecha });
  if (!me) return null;
  const k = d.data?.kpis;

  return (
    <section className="pagina" aria-labelledby="t-inicio">
      <h1 id="t-inicio">Hola, {me.nombre}</h1>
      <p className="texto-secundario">
        {me.centro ? me.centro.nombre : centro ? 'Centro elegido' : 'Todos los centros'} ·{' '}
        {me.rolEtiqueta}
      </p>

      <div className="filtros">
        {!me.centro && (
          <div className="bh-campo">
            <label className="bh-campo__label" htmlFor="d-centro">
              Centro
            </label>
            <select
              id="d-centro"
              className="bh-input"
              value={centro}
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
        )}
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="d-fecha">
            Fecha de las citas
          </label>
          <input
            id="d-fecha"
            type="date"
            className="bh-input"
            value={fecha || d.data?.fecha || ''}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </div>

      {d.isPending && <p role="status">Cargando indicadores…</p>}
      {d.isError && (
        <p className="mensaje-error" role="alert">
          {d.error.message}
        </p>
      )}

      {d.data && k && (
        <>
          <h2>Citas del {diaLargo.format(new Date(`${d.data.fecha}T00:00:00Z`))}</h2>
          <div className="datos" aria-label="Indicadores del día">
            <div className="dato">
              <span className="dato__valor tabular">{k.cargadas}</span>
              <span className="dato__etiqueta">Cargadas</span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">{k.porEnviar}</span>
              <span className="dato__etiqueta">
                <EstadoCitaBadge estado="sin_enviar" size="sm" />
              </span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">{k.enviadas}</span>
              <span className="dato__etiqueta">
                <EstadoCitaBadge estado="enviado" size="sm" />
              </span>
            </div>
            <div className="dato" data-tono="ok">
              <span className="dato__valor tabular">{k.confirmadas}</span>
              <span className="dato__etiqueta">
                <EstadoCitaBadge estado="confirmado" size="sm" />
              </span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">{k.sinRespuesta}</span>
              <span className="dato__etiqueta">
                <EstadoCitaBadge estado="sin_respuesta" size="sm" />
              </span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">{k.canceladas}</span>
              <span className="dato__etiqueta">
                <EstadoCitaBadge estado="cancelado" size="sm" />
              </span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">{k.llamadasEntrantesHoy}</span>
              <span className="dato__etiqueta">Llamadas entrantes hoy</span>
            </div>
          </div>

          <div className="tarjetas">
            <article className="tarjeta">
              <h2>
                <PhoneOutgoing size={16} strokeWidth={1.75} aria-hidden="true" /> Por llamar
              </h2>
              <p className="tabular">{d.data.pendientesPorLlamar}</p>
              <Link to={RUTA.pendientes}>Ver pendientes</Link>
            </article>
            <article className="tarjeta">
              <h2>
                <Undo2 size={16} strokeWidth={1.75} aria-hidden="true" /> Horas por liberar en AVIS
              </h2>
              <p className="tabular">{d.data.liberacionesPendientes}</p>
              <Link to={RUTA.confirmaciones}>Ver confirmaciones</Link>
            </article>
          </div>

          <h2>Próximas a confirmar</h2>
          {d.data.proximasAConfirmar.length === 0 ? (
            <p className="texto-secundario">No hay citas sin enviar para esta fecha.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Paciente</th>
                  <th scope="col">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {d.data.proximasAConfirmar.map((p) => (
                  <tr key={p.id}>
                    <td className="tabular">{p.hora}</td>
                    <td>{p.paciente}</td>
                    <td>{p.tipo === 'cronico' ? 'Crónico' : 'Morbilidad'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>
            <PhoneIncoming size={16} strokeWidth={1.75} aria-hidden="true" /> Últimas llamadas
            entrantes
          </h2>
          {d.data.llamadasRecientes.length === 0 ? (
            <p className="texto-secundario">Aún no hay llamadas registradas.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Centro</th>
                  <th scope="col">RUT</th>
                  <th scope="col">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {d.data.llamadasRecientes.map((l) => (
                  <tr key={l.id}>
                    <td className="tabular">{hora.format(new Date(l.creadaEn))}</td>
                    <td>{l.centro}</td>
                    <td className="tabular">{l.rut}</td>
                    <td>{l.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
