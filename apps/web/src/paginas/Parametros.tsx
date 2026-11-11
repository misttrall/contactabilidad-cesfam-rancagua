import { TablaScroll } from '../componentes/TablaScroll';
import { useState } from 'react';
import { useActualizarParametro, useParametros, type Parametro } from '../api/consultas';

type Ventana = { desde: string; hasta: string };
const esVentana = (v: unknown): v is Ventana =>
  typeof v === 'object' && v !== null && 'desde' in v && 'hasta' in v;

function mostrar(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (esVentana(v)) return `${v.desde} a ${v.hasta}`;
  return String(v);
}

function Fila({ p }: { p: Parametro }) {
  const actualizar = useActualizarParametro();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<unknown>(p.valor);

  const guardar = () =>
    actualizar.mutate({ clave: p.clave, valor }, { onSuccess: () => setEditando(false) });
  const cancelar = () => {
    setValor(p.valor);
    setEditando(false);
    actualizar.reset();
  };

  return (
    <tr>
      <td>
        {p.descripcion}
        <span className="motivo-no tabular">{p.clave}</span>
      </td>
      <td>
        {!editando ? (
          <span className="tabular">{mostrar(p.valor)}</span>
        ) : typeof valor === 'boolean' ? (
          <select
            className="bh-input"
            aria-label={p.descripcion}
            value={valor ? 'si' : 'no'}
            onChange={(e) => setValor(e.target.value === 'si')}
          >
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        ) : typeof valor === 'number' ? (
          <input
            className="bh-input"
            type="number"
            aria-label={p.descripcion}
            value={valor}
            onChange={(e) => setValor(e.target.value === '' ? 0 : Number(e.target.value))}
          />
        ) : esVentana(valor) ? (
          <span className="fila">
            <input
              className="bh-input"
              type="time"
              aria-label="Desde"
              value={valor.desde}
              onChange={(e) => setValor({ ...valor, desde: e.target.value })}
            />
            <input
              className="bh-input"
              type="time"
              aria-label="Hasta"
              value={valor.hasta}
              onChange={(e) => setValor({ ...valor, hasta: e.target.value })}
            />
          </span>
        ) : (
          <input
            className="bh-input"
            aria-label={p.descripcion}
            value={String(valor)}
            onChange={(e) => setValor(e.target.value)}
          />
        )}
        {actualizar.isError && (
          <span className="mensaje-error" role="alert">
            {actualizar.error.message}
          </span>
        )}
      </td>
      <td>
        {!editando ? (
          <button
            className="bh-boton bh-boton--secundario"
            onClick={() => setEditando(true)}
            aria-label={`Editar: ${p.descripcion}`}
          >
            Editar
          </button>
        ) : (
          <span className="fila">
            <button
              className="bh-boton bh-boton--primario"
              disabled={actualizar.isPending}
              onClick={guardar}
            >
              Guardar
            </button>
            <button className="bh-boton bh-boton--secundario" onClick={cancelar}>
              Cancelar
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

/** Horario de envío, esperas, límites y textos. Cada cambio queda en la bitácora de auditoría. */
export function Parametros() {
  const parametros = useParametros();
  return (
    <>
      <h2>Parámetros de envío</h2>
      <p className="texto-secundario">
        Los cambios se aplican a los próximos envíos y quedan registrados en la auditoría.
      </p>
      {parametros.isPending && <p role="status">Cargando parámetros…</p>}
      {parametros.isError && (
        <p className="mensaje-error" role="alert">
          {parametros.error.message}
        </p>
      )}
      {parametros.data && (
        <TablaScroll etiqueta="Parámetros de envío">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Parámetro</th>
                <th scope="col">Valor</th>
                <th scope="col">
                  <span className="solo-lectores">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {parametros.data.map((p) => (
                <Fila key={p.clave} p={p} />
              ))}
            </tbody>
          </table>
        </TablaScroll>
      )}
    </>
  );
}
