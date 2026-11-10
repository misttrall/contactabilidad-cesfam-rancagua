import { CircleCheck, HeartHandshake, Info } from 'lucide-react';
import { useRef, useState } from 'react';
import { MAX_OBSERVACION, MOTIVO_OTROS } from '@bh/shared';
import { EstadoCitaBadge, RutInput } from '@bh/ui';
import {
  useBuscarPaciente,
  useCentros,
  useHistorialLlamadas,
  useMe,
  useMotivos,
  useRegistrarLlamadaEntrante,
} from '../api/consultas';

const hoyChile = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const hora = new Intl.DateTimeFormat('es-CL', { timeStyle: 'short', timeZone: 'America/Santiago' });
const fechaCorta = (f: string) => f.split('-').reverse().join('-');

/**
 * Registro de una llamada entrante pensado para < 30 s (RNF-09): foco en el RUT, `Enter` busca,
 * motivos frecuentes a un clic y `Ctrl+Enter` registra. Mide el tiempo que tarda (métrica del piloto).
 */
export function LlamadaEntrante() {
  const me = useMe().data;
  const centros = useCentros();
  const motivos = useMotivos();
  const registrar = useRegistrarLlamadaEntrante();

  const [centroElegido, setCentroElegido] = useState('');
  const [rut, setRut] = useState<string | null>(null);
  const [rutBuscado, setRutBuscado] = useState<string | null>(null);
  const [motivoId, setMotivoId] = useState('');
  const [otro, setOtro] = useState('');
  const [observacion, setObservacion] = useState('');
  const [exito, setExito] = useState<string | null>(null);
  const [clave, setClave] = useState(0); // al cambiar, el formulario del RUT vuelve a montarse y toma el foco
  const inicio = useRef<number | null>(null);

  const centro = me?.centro ? me.centro.codigo : centroElegido;
  const busqueda = useBuscarPaciente(rutBuscado, centro);
  const hoy = hoyChile();
  const recientes = useHistorialLlamadas({
    centro: me?.centro ? '' : centro,
    desde: hoy,
    hasta: hoy,
    motivoId: '',
    q: '',
    pagina: 1,
    tam: 5,
  });

  if (!me) return null;

  const motivo = motivos.data?.find((m) => m.id === motivoId);
  const esOtros = motivo?.codigo === MOTIVO_OTROS;
  const puede = Boolean(rut && centro && motivoId && (!esOtros || otro.trim().length >= 3));

  const enviar = () => {
    if (!puede || !rut || registrar.isPending) return;
    const segundos = inicio.current ? Math.round((Date.now() - inicio.current) / 1000) : undefined;
    registrar.mutate(
      {
        rut,
        ...(me.centro ? {} : { centro }),
        motivoId,
        ...(esOtros ? { otroMotivo: otro.trim() } : {}),
        ...(observacion.trim() ? { observacion: observacion.trim() } : {}),
        ...(segundos !== undefined ? { segundos } : {}),
      },
      {
        onSuccess: (r) => {
          setExito(
            `Llamada registrada${segundos !== undefined ? ` en ${segundos} s` : ''}` +
              (r.pacienteEncontrado ? '.' : ' (paciente no cargado: quedó solo con el RUT).'),
          );
          setRut(null);
          setRutBuscado(null);
          setMotivoId('');
          setOtro('');
          setObservacion('');
          inicio.current = null;
          setClave((k) => k + 1);
        },
      },
    );
  };

  return (
    <section className="pagina" aria-labelledby="t-entrante">
      <h1 id="t-entrante">Llamada entrante</h1>

      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            enviar();
          }
        }}
      >
        {!me.centro && (
          <div className="bh-campo">
            <label className="bh-campo__label" htmlFor="e-centro">
              Centro
            </label>
            <select
              id="e-centro"
              className="bh-input"
              value={centroElegido}
              onChange={(e) => setCentroElegido(e.target.value)}
            >
              <option value="">Selecciona el centro…</option>
              {centros.data?.map((c) => (
                <option key={c.id} value={c.codigo}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <RutInput
          key={clave}
          autoFocus
          onChange={(valido) => {
            if (inicio.current === null) inicio.current = Date.now();
            setRut(valido);
            if (valido !== rutBuscado) setRutBuscado(null);
            setExito(null);
          }}
          onBuscar={(valido) => setRutBuscado(valido)}
        />
        <p className="texto-secundario nota">
          <Info size={14} strokeWidth={1.75} aria-hidden="true" /> Escribe el RUT y pulsa Enter para
          buscar al paciente.
        </p>

        {busqueda.isFetching && <p role="status">Buscando…</p>}
        {busqueda.isError && (
          <p className="mensaje-error" role="alert">
            {busqueda.error.message}
          </p>
        )}
        {busqueda.data?.encontrado === true && (
          <article className="tarjeta" aria-label="Paciente encontrado">
            <h2>Paciente encontrado</h2>
            <p>
              {busqueda.data.paciente.nombre}{' '}
              {busqueda.data.paciente.adultoMayor && (
                <span className="etiqueta etiqueta--am">
                  <HeartHandshake size={14} strokeWidth={1.75} aria-hidden="true" /> Adulto mayor
                </span>
              )}
            </p>
            <p className="texto-secundario tabular">
              {busqueda.data.paciente.edad !== null && <>{busqueda.data.paciente.edad} años · </>}
              {busqueda.data.paciente.telefono ?? 'Sin teléfono'}
            </p>
            {busqueda.data.proximasCitas.length > 0 ? (
              <ul className="historial-contactos">
                {busqueda.data.proximasCitas.map((c, i) => (
                  <li key={i}>
                    {fechaCorta(c.fecha)} {c.hora} · {c.profesional} ·{' '}
                    <EstadoCitaBadge estado={c.estado} size="sm" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="texto-secundario">Sin próximas citas cargadas.</p>
            )}
          </article>
        )}
        {busqueda.data?.encontrado === false && (
          <p className="aviso" role="status">
            <Info size={16} strokeWidth={1.75} aria-hidden="true" /> Este RUT no está cargado en
            este centro: la llamada se registrará solo con el RUT.
          </p>
        )}

        <fieldset className="motivos">
          <legend>Motivo de la llamada</legend>
          <div className="fila">
            {motivos.data?.slice(0, 3).map((m) => (
              <button
                type="button"
                key={m.id}
                className="bh-boton bh-boton--secundario"
                aria-pressed={motivoId === m.id}
                data-activo={motivoId === m.id}
                onClick={() => setMotivoId(m.id)}
              >
                {m.descripcion}
              </button>
            ))}
          </div>
          <label className="bh-campo__label" htmlFor="e-motivo">
            Todos los motivos
          </label>
          <select
            id="e-motivo"
            className="bh-input"
            value={motivoId}
            onChange={(e) => setMotivoId(e.target.value)}
          >
            <option value="">Selecciona el motivo…</option>
            {motivos.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.descripcion}
              </option>
            ))}
          </select>
        </fieldset>

        {esOtros && (
          <div className="bh-campo">
            <label className="bh-campo__label" htmlFor="e-otro">
              Especificar motivo (obligatorio)
            </label>
            <input
              id="e-otro"
              className="bh-input"
              maxLength={200}
              value={otro}
              onChange={(e) => setOtro(e.target.value)}
            />
          </div>
        )}

        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="e-obs">
            Observación (opcional)
          </label>
          <textarea
            id="e-obs"
            className="bh-input"
            rows={2}
            maxLength={MAX_OBSERVACION}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />
          <span className="texto-secundario">No escribas datos clínicos ni diagnósticos.</span>
        </div>

        {registrar.isError && (
          <p className="mensaje-error" role="alert">
            {registrar.error.message}
          </p>
        )}
        <div className="acciones">
          <button
            type="submit"
            className="bh-boton bh-boton--primario"
            disabled={!puede || registrar.isPending}
          >
            {registrar.isPending ? 'Registrando…' : 'Registrar llamada'}
          </button>
          <span className="texto-secundario">
            o pulsa <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
          </span>
        </div>
        {exito && (
          <p className="exito" role="status">
            <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" /> {exito}
          </p>
        )}
      </form>

      <h2>Registradas hoy</h2>
      {recientes.data && recientes.data.filas.length === 0 && (
        <p className="texto-secundario">Todavía no hay llamadas hoy.</p>
      )}
      {recientes.data && recientes.data.filas.length > 0 && (
        <ul className="historial-contactos">
          {recientes.data.filas.map((f) => (
            <li key={f.id}>
              {hora.format(new Date(f.creadaEn))} · {f.paciente ?? f.rut} · {f.motivo}
              {f.segundos !== null && <span className="texto-secundario"> · {f.segundos} s</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
