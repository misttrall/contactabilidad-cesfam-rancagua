import { TablaScroll } from '../componentes/TablaScroll';
import { HeartHandshake, Info, PhoneCall } from 'lucide-react';
import { useState } from 'react';
import {
  AYUDA_RESULTADO,
  ETIQUETA_RESULTADO,
  MAX_OBSERVACION,
  RESULTADOS_LLAMADA,
} from '@bh/shared';
import { EstadoCitaBadge } from '@bh/ui';
import {
  useCentros,
  useContactos,
  useMe,
  usePendientes,
  useRegistrarResultado,
  useRevelar,
  type FilaPendiente,
  type ResultadoLlamadaApi,
} from '../api/consultas';
import { DatoSensible } from '../componentes/DatoSensible';
import { Panel } from '../componentes/Panel';

const hora = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Santiago',
});
const fechaCorta = (f: string) => f.split('-').reverse().join('-');

function Detalle({
  fila,
  alRegistrar,
}: {
  fila: FilaPendiente;
  alRegistrar: (r: ResultadoLlamadaApi, liberar: boolean) => void;
}) {
  const contactos = useContactos(fila.id);
  const revelar = useRevelar();
  const registrar = useRegistrarResultado();
  const [resultado, setResultado] = useState<ResultadoLlamadaApi | null>(null);
  const [observacion, setObservacion] = useState('');

  const enviar = () => {
    if (!resultado) return;
    registrar.mutate(
      {
        citaId: fila.id,
        resultado,
        ...(observacion.trim() ? { observacion: observacion.trim() } : {}),
      },
      { onSuccess: (r) => alRegistrar(resultado, r.liberarEnAvis) },
    );
  };

  return (
    <div className="detalle-llamada">
      <p>
        <strong>{fila.paciente}</strong>{' '}
        {fila.adultoMayor && (
          <span className="etiqueta etiqueta--am">
            <HeartHandshake size={14} strokeWidth={1.75} aria-hidden="true" /> Adulto mayor
          </span>
        )}
      </p>
      <p className="texto-secundario">
        Cita del {fechaCorta(fila.fecha)} a las {fila.hora} · {fila.profesional} · {fila.prestacion}
      </p>

      <DatoSensible
        etiqueta="Teléfono"
        enmascarado={fila.telefono ?? 'Sin teléfono'}
        obtener={async () =>
          (await revelar.mutateAsync({ pacienteId: fila.pacienteId, campo: 'telefono' })).valor
        }
      />
      {fila.bajaWhatsApp && (
        <p className="aviso" role="note">
          <Info size={16} strokeWidth={1.75} aria-hidden="true" /> Este paciente pidió no recibir
          más mensajes por WhatsApp: solo se le puede llamar.
        </p>
      )}

      <section aria-labelledby="t-hist">
        <h3 id="t-hist">Contactos anteriores</h3>
        {contactos.isPending && <p role="status">Cargando…</p>}
        {contactos.data &&
          contactos.data.mensajes.length + contactos.data.llamadas.length === 0 && (
            <p className="texto-secundario">Sin contactos previos.</p>
          )}
        <ul className="historial-contactos">
          {contactos.data?.mensajes.map((m, i) => (
            <li key={`m${i}`}>
              WhatsApp ({m.tipo}) ·{' '}
              {m.leidoEn ? 'leído' : m.estado === 'fallido' ? 'no llegó' : m.estado}
              {m.enviadoEn && <> · {hora.format(new Date(m.enviadoEn))}</>}
            </li>
          ))}
          {contactos.data?.llamadas.map((l) => (
            <li key={l.id}>
              Llamada: <strong>{ETIQUETA_RESULTADO[l.resultado]}</strong> · {l.registradoPor} ·{' '}
              {hora.format(new Date(l.creadaEn))}
              {l.observacion && <span className="texto-secundario"> — {l.observacion}</span>}
            </li>
          ))}
        </ul>
      </section>

      <fieldset
        className="resultados"
        onKeyDown={(e) => {
          // Atajos 1-4 (no cuando se escribe en la observación).
          if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
          const i = Number(e.key) - 1;
          const r = RESULTADOS_LLAMADA[i];
          if (r) setResultado(r);
        }}
      >
        <legend>Resultado de la llamada</legend>
        {RESULTADOS_LLAMADA.map((r, i) => (
          <label key={r} className="opcion-resultado" data-activa={resultado === r}>
            <input
              type="radio"
              name="resultado"
              checked={resultado === r}
              onChange={() => setResultado(r)}
            />
            <span>
              <strong>
                {ETIQUETA_RESULTADO[r]} <kbd>{i + 1}</kbd>
              </strong>
              <span className="texto-secundario">{AYUDA_RESULTADO[r]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {(resultado === 'recado' || resultado === 'no_ubicado') && (
        <p className="aviso" role="note">
          <Info size={16} strokeWidth={1.75} aria-hidden="true" /> La cita sigue vigente. «Sin
          respuesta» nunca cancela la hora.
        </p>
      )}

      <div className="bh-campo">
        <label className="bh-campo__label" htmlFor="obs-llamada">
          Observación (opcional)
        </label>
        <textarea
          id="obs-llamada"
          className="bh-input"
          rows={3}
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
          className="bh-boton bh-boton--primario"
          disabled={!resultado || registrar.isPending}
          onClick={enviar}
        >
          {registrar.isPending ? 'Registrando…' : 'Registrar resultado'}
        </button>
      </div>
    </div>
  );
}

export function Pendientes() {
  const me = useMe().data;
  const centros = useCentros();
  const [centroElegido, setCentroElegido] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const centro = me?.centro ? me.centro.codigo : centroElegido;
  const lista = usePendientes(centro);
  const filas = lista.data?.filas ?? [];
  const fila = filas.find((f) => f.id === abierta) ?? null;

  if (!me) return null;

  const alRegistrar = (r: ResultadoLlamadaApi, liberar: boolean) => {
    // Pasa a la siguiente de la lista (la actual puede seguir ahí si fue recado o no ubicado).
    const i = filas.findIndex((f) => f.id === abierta);
    const proxima = filas[i + 1] ?? filas.find((f) => f.id !== abierta) ?? null;
    setAviso(
      `Registrado: ${ETIQUETA_RESULTADO[r]}.` +
        (liberar
          ? ' Recuerda liberar la hora en AVIS: aparece en «Horas por liberar» de Confirmación masiva.'
          : ''),
    );
    setAbierta(proxima && proxima.id !== abierta ? proxima.id : null);
  };

  return (
    <section className="pagina" aria-labelledby="t-pend">
      <h1 id="t-pend">Pendientes por llamar</h1>

      <p className="aviso" role="note">
        <Info size={16} strokeWidth={1.75} aria-hidden="true" /> «Sin respuesta»{' '}
        <strong>nunca cancela la hora</strong>. Los adultos mayores van primero.
      </p>

      {!me.centro && (
        <div className="bh-campo filtros">
          <label className="bh-campo__label" htmlFor="p-centro">
            Centro
          </label>
          <select
            id="p-centro"
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
      {!me.centro && !centroElegido && (
        <p className="texto-secundario">Elige un centro para ver sus pendientes.</p>
      )}
      {lista.isError && (
        <p className="mensaje-error" role="alert">
          {lista.error.message}
        </p>
      )}
      {aviso && (
        <p className="texto-secundario" role="status">
          {aviso}
        </p>
      )}

      {lista.data && filas.length === 0 && (
        <p className="texto-secundario" role="status">
          No hay pacientes pendientes por llamar. ¡Buen trabajo!
        </p>
      )}
      {filas.length > 0 && (
        <>
          <p className="texto-secundario" aria-live="polite">
            {filas.length} {filas.length === 1 ? 'paciente pendiente' : 'pacientes pendientes'}
          </p>
          <TablaScroll etiqueta="Pacientes pendientes por llamar">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Cita</th>
                  <th scope="col">Paciente</th>
                  <th scope="col">Profesional</th>
                  <th scope="col">Intentos</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="solo-lectores">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} data-seleccionada={f.id === abierta}>
                    <td className="tabular">
                      {fechaCorta(f.fecha)} {f.hora}
                    </td>
                    <td>
                      {f.paciente}{' '}
                      {f.adultoMayor && (
                        <span className="etiqueta etiqueta--am">
                          <HeartHandshake size={14} strokeWidth={1.75} aria-hidden="true" /> Adulto
                          mayor
                        </span>
                      )}
                    </td>
                    <td>{f.profesional}</td>
                    <td>
                      {f.intentos === 0 ? (
                        <span className="texto-secundario">Sin llamar</span>
                      ) : (
                        <>
                          {f.intentos} {f.intentos === 1 ? 'intento' : 'intentos'}
                          {f.ultimoIntento && (
                            <span className="motivo-no">
                              {ETIQUETA_RESULTADO[f.ultimoIntento.resultado]} ·{' '}
                              {hora.format(new Date(f.ultimoIntento.creadaEn))}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      <EstadoCitaBadge
                        estado="sin_respuesta"
                        {...(f.subestado ? { subestado: f.subestado } : {})}
                        size="sm"
                      />
                    </td>
                    <td>
                      <button
                        className="bh-boton bh-boton--primario"
                        onClick={() => {
                          setAviso(null);
                          setAbierta(f.id);
                        }}
                        aria-label={`Llamar a ${f.paciente}`}
                      >
                        <PhoneCall size={16} strokeWidth={1.75} aria-hidden="true" /> Llamar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScroll>
        </>
      )}

      <Panel abierto={fila !== null} onCerrar={() => setAbierta(null)} titulo="Registrar llamada">
        {fila && <Detalle key={fila.id} fila={fila} alRegistrar={alRegistrar} />}
      </Panel>
    </section>
  );
}
