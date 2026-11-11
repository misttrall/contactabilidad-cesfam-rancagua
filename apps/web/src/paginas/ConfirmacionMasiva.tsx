import { useQueryClient } from '@tanstack/react-query';
import { HeartHandshake, Send, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ETIQUETA_ESTADO, type EstadoCita } from '@bh/shared';
import { EstadoCitaBadge } from '@bh/ui';
import {
  useCentros,
  useConfirmaciones,
  useCrearEnvio,
  useLiberaciones,
  useMe,
  usePrevisualizarEnvio,
  useProgresoEnvio,
  useResolverLiberacion,
  useSimularRespuestas,
  type FilaConfirmacion,
  type TipoFiltro,
} from '../api/consultas';

const ESTADOS: EstadoCita[] = ['sin_enviar', 'enviado', 'confirmado', 'sin_respuesta', 'cancelado'];

const MOTIVO: Record<NonNullable<FilaConfirmacion['motivoNoSeleccionable']>, string> = {
  ya_enviada: 'Ya enviada',
  baja: 'Pidió no recibir WhatsApp',
  sin_telefono: 'Sin teléfono',
};

/** Fecha de hoy + 2 días en hora de Chile (la anticipación por defecto); el servidor sugiere la exacta. */
function fechaInicial(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
    new Date(Date.now() + 2 * 86_400_000),
  );
}

const hora = new Intl.DateTimeFormat('es-CL', { timeStyle: 'short', timeZone: 'America/Santiago' });

/** Diálogo nativo: el navegador atrapa el foco y cierra con Esc. */
function Dialogo({
  abierto,
  onCerrar,
  titulo,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!abierto && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [abierto]);
  return (
    <dialog ref={ref} className="dialogo" aria-labelledby={idTitulo} onClose={onCerrar}>
      <h2 id={idTitulo}>{titulo}</h2>
      {children}
    </dialog>
  );
}

export function ConfirmacionMasiva() {
  const me = useMe().data;
  const centros = useCentros();
  const [centroElegido, setCentroElegido] = useState('');
  const [fecha, setFecha] = useState(fechaInicial);
  const [tipo, setTipo] = useState<TipoFiltro>('cronico');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [dialogo, setDialogo] = useState(false);
  const [envioId, setEnvioId] = useState<string | null>(null);

  const centro = me?.centro ? me.centro.codigo : centroElegido;
  const listado = useConfirmaciones({ centro, fecha, tipo });
  const previsualizar = usePrevisualizarEnvio();
  const crear = useCrearEnvio();
  const progreso = useProgresoEnvio(envioId);
  const simular = useSimularRespuestas();
  const liberaciones = useLiberaciones();
  const resolver = useResolverLiberacion();
  const queryClient = useQueryClient();

  // Mientras avanza un envío, la tabla se actualiza con él: si no, quedaría mostrando «Sin enviar»
  // aunque los mensajes ya hayan salido (el refresco al pulsar «Enviar» ocurre antes que el worker).
  const claveProgreso = progreso.data ? JSON.stringify(progreso.data.mensajes) : '';
  useEffect(() => {
    if (claveProgreso) void queryClient.invalidateQueries({ queryKey: ['confirmaciones'] });
  }, [claveProgreso, queryClient]);

  const filas = useMemo(() => listado.data?.filas ?? [], [listado.data]);
  const seleccionables = useMemo(() => filas.filter((f) => f.seleccionable), [filas]);
  const idsSeleccionados = useMemo(
    () => seleccionables.filter((f) => seleccion.has(f.id)).map((f) => f.id),
    [seleccionables, seleccion],
  );

  if (!me) return null;

  /** Cambiar un filtro limpia la selección: nunca se envía lo que ya no está a la vista (D-05). */
  const cambiarFiltro = (aplicar: () => void) => {
    aplicar();
    setSeleccion(new Set());
  };
  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todasMarcadas =
    seleccionables.length > 0 && idsSeleccionados.length === seleccionables.length;
  const algunaMarcada = idsSeleccionados.length > 0 && !todasMarcadas;

  const abrirDialogo = () => {
    previsualizar.mutate({ centro, citaIds: idsSeleccionados });
    setDialogo(true);
  };
  const confirmarEnvio = () => {
    crear.mutate(
      { centro, citaIds: idsSeleccionados },
      {
        onSuccess: (r) => {
          setEnvioId(r.envioId);
          setSeleccion(new Set());
          setDialogo(false);
        },
      },
    );
  };

  const o = listado.data?.opciones;
  const p = previsualizar.data;
  const sinCentro = !me.centro && !centroElegido;

  return (
    <section className="pagina" aria-labelledby="t-conf">
      <h1 id="t-conf">Confirmación masiva por WhatsApp</h1>

      <div className="filtros">
        {!me.centro && (
          <div className="bh-campo">
            <label className="bh-campo__label" htmlFor="f-centro">
              Centro
            </label>
            <select
              id="f-centro"
              className="bh-input"
              value={centroElegido}
              onChange={(e) => cambiarFiltro(() => setCentroElegido(e.target.value))}
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
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="f-fecha">
            Fecha de las citas
          </label>
          <input
            id="f-fecha"
            type="date"
            className="bh-input"
            value={fecha}
            onChange={(e) => cambiarFiltro(() => setFecha(e.target.value))}
          />
        </div>
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="f-tipo">
            Tipo
          </label>
          <select
            id="f-tipo"
            className="bh-input"
            value={tipo}
            onChange={(e) => cambiarFiltro(() => setTipo(e.target.value as TipoFiltro))}
          >
            <option value="cronico">Solo crónicos</option>
            <option value="morbilidad">Solo morbilidad</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        {o && o.fechaSugerida !== fecha && (
          <button
            className="bh-boton bh-boton--secundario"
            onClick={() => cambiarFiltro(() => setFecha(o.fechaSugerida))}
          >
            Usar la fecha sugerida ({o.fechaSugerida})
          </button>
        )}
      </div>

      {sinCentro && <p className="texto-secundario">Elige un centro para ver sus citas.</p>}
      {listado.isError && (
        <p className="mensaje-error" role="alert">
          {listado.error.message}
        </p>
      )}

      {listado.data && (
        <>
          <div className="resumen-estados" aria-label="Resumen de las citas del día">
            {ESTADOS.map((e) => (
              <div key={e} className="resumen-estados__item">
                <EstadoCitaBadge estado={e} />
                <strong
                  className="tabular"
                  aria-label={`${ETIQUETA_ESTADO[e]}: ${listado.data.resumen[e]}`}
                >
                  {listado.data.resumen[e]}
                </strong>
              </div>
            ))}
          </div>

          {o && (
            <p className="texto-secundario nota">
              Los mensajes salen entre las {o.ventana.desde} y las {o.ventana.hasta} (hora de
              Chile). Quien no responde en {o.horasEspera} h pasa a «Sin respuesta» y se le llama:{' '}
              <strong>nunca se cancela la hora</strong>.
            </p>
          )}

          {listado.data.truncado && (
            <p className="aviso" role="note">
              <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" /> Se muestran las
              primeras 1.000 citas. Filtra por tipo para ver el resto.
            </p>
          )}

          {filas.length === 0 ? (
            <p className="texto-secundario">
              No hay citas {tipo !== 'todos' ? 'de ese tipo ' : ''}para esa fecha.
            </p>
          ) : (
            <div
              className="tabla-scroll"
              role="region"
              tabIndex={0}
              aria-label="Tabla con desplazamiento"
            >
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas las citas disponibles"
                        checked={todasMarcadas}
                        ref={(el) => {
                          if (el) el.indeterminate = algunaMarcada;
                        }}
                        disabled={seleccionables.length === 0}
                        onChange={() =>
                          setSeleccion(
                            todasMarcadas ? new Set() : new Set(seleccionables.map((f) => f.id)),
                          )
                        }
                      />
                    </th>
                    <th scope="col">Hora</th>
                    <th scope="col">Paciente</th>
                    <th scope="col">RUT</th>
                    <th scope="col">Teléfono</th>
                    <th scope="col">Profesional</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id} data-seleccionada={seleccion.has(f.id)}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={
                            f.seleccionable
                              ? `Seleccionar a ${f.paciente}`
                              : `${f.paciente}: ${MOTIVO[f.motivoNoSeleccionable!]}`
                          }
                          checked={seleccion.has(f.id)}
                          disabled={!f.seleccionable}
                          onChange={() => alternar(f.id)}
                        />
                      </td>
                      <td className="tabular">{f.hora}</td>
                      <td>
                        {f.paciente}{' '}
                        {f.adultoMayor && (
                          <span className="etiqueta etiqueta--am">
                            <HeartHandshake size={14} strokeWidth={1.75} aria-hidden="true" />{' '}
                            Adulto mayor
                          </span>
                        )}
                      </td>
                      <td className="tabular">{f.rut}</td>
                      <td className="tabular">{f.telefono ?? '—'}</td>
                      <td>{f.profesional}</td>
                      <td>{f.tipo === 'cronico' ? 'Crónico' : 'Morbilidad'}</td>
                      <td>
                        <EstadoCitaBadge
                          estado={f.estado}
                          {...(f.subestado ? { subestado: f.subestado } : {})}
                          size="sm"
                        />
                        {f.motivoNoSeleccionable && f.estado === 'sin_enviar' && (
                          <span className="motivo-no">{MOTIVO[f.motivoNoSeleccionable]}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="barra-seleccion" role="region" aria-label="Acciones sobre la selección">
            <span aria-live="polite">
              {idsSeleccionados.length === 0
                ? 'Ninguna cita seleccionada'
                : `${idsSeleccionados.length} ${idsSeleccionados.length === 1 ? 'seleccionada' : 'seleccionadas'}`}
            </span>
            <button
              className="bh-boton bh-boton--primario"
              disabled={idsSeleccionados.length === 0}
              onClick={abrirDialogo}
            >
              <Send size={16} strokeWidth={1.75} aria-hidden="true" /> Enviar confirmación
            </button>
            <button
              className="bh-boton bh-boton--secundario"
              disabled={idsSeleccionados.length === 0}
              onClick={() => setSeleccion(new Set())}
            >
              Limpiar
            </button>
            {o?.puedeSimular && (
              <button
                className="bh-boton bh-boton--secundario"
                disabled={simular.isPending}
                onClick={() => simular.mutate(centro)}
                title="Solo en la demo: contesta como si fueran los pacientes"
              >
                {simular.isPending ? 'Simulando…' : 'Simular respuestas de pacientes (demo)'}
              </button>
            )}
          </div>
          {simular.data && (
            <p className="texto-secundario" role="status">
              Simulación: {simular.data.confirmadas} confirmaron, {simular.data.canceladas}{' '}
              cancelaron, {simular.data.bajas} pidieron la baja, {simular.data.sinResponder} no
              respondieron y {simular.data.sinEntregar} no recibieron el mensaje.
            </p>
          )}
        </>
      )}

      {progreso.data && (
        <section className="panel" aria-labelledby="t-prog" role="status">
          <h2 id="t-prog">Envío en curso</h2>
          <div className="datos">
            <div className="dato">
              <span className="dato__valor tabular">{progreso.data.mensajes.en_cola}</span>
              <span className="dato__etiqueta">En cola</span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">
                {progreso.data.mensajes.enviado +
                  progreso.data.mensajes.entregado +
                  progreso.data.mensajes.leido}
              </span>
              <span className="dato__etiqueta">Enviados</span>
            </div>
            <div className="dato">
              <span className="dato__valor tabular">{progreso.data.mensajes.leido}</span>
              <span className="dato__etiqueta">Leídos</span>
            </div>
            <div className="dato" data-tono={progreso.data.mensajes.fallido ? 'alerta' : undefined}>
              <span className="dato__valor tabular">{progreso.data.mensajes.fallido}</span>
              <span className="dato__etiqueta">No llegaron</span>
            </div>
          </div>
          <p className="texto-secundario">
            {progreso.data.terminado ? 'Envío terminado. ' : 'Enviando… '}
            {progreso.data.omitidasSinTelefono + progreso.data.omitidasBaja > 0 &&
              `${progreso.data.omitidasSinTelefono + progreso.data.omitidasBaja} pacientes sin WhatsApp posible pasaron a «Pendientes por llamar». `}
            {progreso.data.mensajes.fallido > 0 &&
              'Quienes no recibieron el mensaje también pasaron a «Pendientes por llamar».'}
          </p>
        </section>
      )}

      {liberaciones.data && liberaciones.data.length > 0 && (
        <section className="panel" aria-labelledby="t-lib">
          <h2 id="t-lib">Horas por liberar en AVIS ({liberaciones.data.length})</h2>
          <p className="texto-secundario">
            Estos pacientes respondieron «No podré asistir». AVIS es el dueño de la agenda: libera
            la hora allí y márcala aquí.
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
                  <th scope="col">Fecha</th>
                  <th scope="col">Hora</th>
                  <th scope="col">Paciente</th>
                  <th scope="col">RUT</th>
                  <th scope="col">Profesional</th>
                  <th scope="col">
                    <span className="solo-lectores">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {liberaciones.data.map((l) => (
                  <tr key={l.id}>
                    <td className="tabular">{l.fecha}</td>
                    <td className="tabular">{l.hora}</td>
                    <td>{l.paciente}</td>
                    <td className="tabular">{l.rut}</td>
                    <td>{l.profesional}</td>
                    <td>
                      <button
                        className="bh-boton bh-boton--secundario"
                        disabled={resolver.isPending}
                        onClick={() => resolver.mutate(l.id)}
                        aria-label={`Ya la liberé: ${l.paciente}`}
                      >
                        Ya la liberé
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Dialogo abierto={dialogo} onCerrar={() => setDialogo(false)} titulo="Confirmar el envío">
        {previsualizar.isPending && <p role="status">Revisando la selección…</p>}
        {previsualizar.isError && (
          <p className="mensaje-error" role="alert">
            {previsualizar.error.message}
          </p>
        )}
        {p && (
          <>
            <p>
              Se enviará un WhatsApp a{' '}
              <strong>
                {p.aEnviar} {p.aEnviar === 1 ? 'paciente' : 'pacientes'}
              </strong>
              {p.sinTelefono + p.baja > 0 && (
                <>
                  . {p.sinTelefono + p.baja} sin WhatsApp posible (sin teléfono o con baja) quedarán
                  en «Pendientes por llamar»
                </>
              )}
              {p.yaEnviadasOEnOtroEstado > 0 && (
                <>. {p.yaEnviadasOEnOtroEstado} ya estaban enviadas y se omiten</>
              )}
              .
            </p>
            {p.mensaje && (
              <blockquote className="vista-mensaje">
                <p>{p.mensaje}</p>
                <p className="botones-ejemplo">[Sí, asistiré] [No podré asistir]</p>
              </blockquote>
            )}
            {p.programadoPara && (
              <p className="aviso" role="note">
                <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
                Ahora estamos fuera del horario de envío: los mensajes saldrán a las{' '}
                {hora.format(new Date(p.programadoPara))}.
              </p>
            )}
            {crear.isError && (
              <p className="mensaje-error" role="alert">
                {crear.error.message}
              </p>
            )}
          </>
        )}
        <div className="acciones">
          <button
            className="bh-boton bh-boton--primario"
            disabled={!p || p.aEnviar === 0 || crear.isPending}
            onClick={confirmarEnvio}
          >
            {crear.isPending
              ? 'Enviando…'
              : p
                ? `Enviar a ${p.aEnviar} ${p.aEnviar === 1 ? 'paciente' : 'pacientes'}`
                : 'Enviar'}
          </button>
          <button className="bh-boton bh-boton--secundario" onClick={() => setDialogo(false)}>
            Cancelar
          </button>
        </div>
      </Dialogo>
    </section>
  );
}
