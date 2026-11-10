import { CircleCheck, CircleSlash } from 'lucide-react';
import { useActualizarMotivo, useCentros, useMotivosAdmin } from '../api/consultas';

function EstadoActivo({ activo }: { activo: boolean }) {
  // Texto + ícono (no solo color), según la skill de diseño.
  return activo ? (
    <span className="etiqueta etiqueta--ok">
      <CircleCheck size={14} strokeWidth={1.75} aria-hidden="true" /> Activo
    </span>
  ) : (
    <span className="etiqueta etiqueta--inactivo">
      <CircleSlash size={14} strokeWidth={1.75} aria-hidden="true" /> Inactivo
    </span>
  );
}

export function Configuracion() {
  const centros = useCentros();
  const motivos = useMotivosAdmin();
  const actualizar = useActualizarMotivo();

  return (
    <section className="pagina" aria-labelledby="t-config">
      <h1 id="t-config">Configuración</h1>

      <h2>Centros</h2>
      {centros.isPending && <p role="status">Cargando centros…</p>}
      {centros.isError && (
        <p className="mensaje-error" role="alert">
          {centros.error.message}
        </p>
      )}
      {centros.data && (
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Nombre</th>
            </tr>
          </thead>
          <tbody>
            {centros.data.map((c) => (
              <tr key={c.id}>
                <td className="tabular">{c.codigo}</td>
                <td>{c.nombre}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Motivos de llamada entrante</h2>
      <p className="texto-secundario">
        Los motivos inactivos dejan de aparecer al registrar llamadas; el historial no cambia.
      </p>
      {motivos.isPending && <p role="status">Cargando motivos…</p>}
      {motivos.isError && (
        <p className="mensaje-error" role="alert">
          {motivos.error.message}
        </p>
      )}
      {actualizar.isError && (
        <p className="mensaje-error" role="alert">
          No se pudo guardar el cambio: {actualizar.error.message}
        </p>
      )}
      {motivos.data && (
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Descripción</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="solo-lectores">Acción</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {motivos.data.map((m) => (
              <tr key={m.id}>
                <td className="tabular">{m.codigo}</td>
                <td>{m.descripcion}</td>
                <td>
                  <EstadoActivo activo={m.activo} />
                </td>
                <td>
                  <button
                    className="bh-boton bh-boton--secundario"
                    disabled={actualizar.isPending}
                    onClick={() => actualizar.mutate({ id: m.id, activo: !m.activo })}
                    aria-label={`${m.activo ? 'Desactivar' : 'Activar'} el motivo ${m.descripcion}`}
                  >
                    {m.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
