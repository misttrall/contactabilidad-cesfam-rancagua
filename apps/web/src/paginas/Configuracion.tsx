import { TablaScroll } from '../componentes/TablaScroll';
import { ArrowDown, ArrowUp, CircleCheck, CircleSlash, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ETIQUETA_ROL, ROLES, type Rol } from '@bh/shared';
import {
  useActualizarMotivo,
  useCentrosAdmin,
  useCrearCentro,
  useCrearMotivo,
  useEditarCentro,
  useEditarUsuario,
  useEstadoDemo,
  useMoverMotivo,
  useMotivosAdmin,
  usePlantillas,
  useRestablecerDemo,
  useUsuariosAdmin,
  type CentroAdmin,
  type UsuarioAdmin,
} from '../api/consultas';
import { Parametros } from './Parametros';

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

function Mensaje({ e }: { e: { message: string } | null }) {
  return e ? (
    <p className="mensaje-error" role="alert">
      {e.message}
    </p>
  ) : null;
}

// ------------------------------------------------------------------------------------ centros

function FilaCentro({ c }: { c: CentroAdmin }) {
  const editar = useEditarCentro();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(c.nombre);
  const guardar = () =>
    editar.mutate({ id: c.id, nombre }, { onSuccess: () => setEditando(false) });
  return (
    <tr>
      <td className="tabular">{c.codigo}</td>
      <td>
        {editando ? (
          <input
            className="bh-input"
            aria-label={`Nombre del centro ${c.codigo}`}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        ) : (
          c.nombre
        )}
        <Mensaje e={editar.error} />
      </td>
      <td>
        <EstadoActivo activo={c.activo} />
      </td>
      <td>
        <div className="fila">
          {editando ? (
            <>
              <button
                className="bh-boton bh-boton--primario"
                onClick={guardar}
                disabled={editar.isPending}
              >
                Guardar
              </button>
              <button
                className="bh-boton bh-boton--secundario"
                onClick={() => {
                  setEditando(false);
                  setNombre(c.nombre);
                  editar.reset();
                }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                className="bh-boton bh-boton--secundario"
                onClick={() => setEditando(true)}
                aria-label={`Editar el centro ${c.nombre}`}
              >
                Editar
              </button>
              <button
                className="bh-boton bh-boton--secundario"
                disabled={editar.isPending}
                onClick={() => editar.mutate({ id: c.id, activo: !c.activo })}
                aria-label={`${c.activo ? 'Desactivar' : 'Activar'} el centro ${c.nombre}`}
              >
                {c.activo ? 'Desactivar' : 'Activar'}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function Centros() {
  const centros = useCentrosAdmin();
  const crear = useCrearCentro();
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate(
      { codigo, nombre },
      {
        onSuccess: () => {
          setCodigo('');
          setNombre('');
        },
      },
    );
  };
  return (
    <>
      <h2>Centros</h2>
      {centros.isPending && <p role="status">Cargando centros…</p>}
      <Mensaje e={centros.error} />
      {centros.data && (
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Nombre</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="solo-lectores">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {centros.data.map((c) => (
              <FilaCentro key={c.id} c={c} />
            ))}
          </tbody>
        </table>
      )}
      <form className="filtros" onSubmit={enviar} aria-label="Agregar centro">
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="cn-codigo">
            Código del centro
          </label>
          <input
            id="cn-codigo"
            className="bh-input"
            value={codigo}
            maxLength={12}
            onChange={(e) => setCodigo(e.target.value)}
          />
        </div>
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="cn-nombre">
            Nombre del centro
          </label>
          <input
            id="cn-nombre"
            className="bh-input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <button
          className="bh-boton bh-boton--primario"
          type="submit"
          disabled={crear.isPending || codigo.trim() === '' || nombre.trim() === ''}
        >
          Agregar centro
        </button>
      </form>
      <Mensaje e={crear.error} />
    </>
  );
}

// ------------------------------------------------------------------------------------ motivos

function Motivos() {
  const motivos = useMotivosAdmin();
  const actualizar = useActualizarMotivo();
  const mover = useMoverMotivo();
  const crear = useCrearMotivo();
  const [codigo, setCodigo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate(
      { codigo, descripcion },
      {
        onSuccess: () => {
          setCodigo('');
          setDescripcion('');
        },
      },
    );
  };
  const n = motivos.data?.length ?? 0;
  return (
    <>
      <h2>Motivos de llamada entrante</h2>
      <p className="texto-secundario">
        El orden es el de la lista al registrar una llamada. Los motivos inactivos dejan de
        aparecer; el historial no cambia.
      </p>
      {motivos.isPending && <p role="status">Cargando motivos…</p>}
      <Mensaje e={motivos.error} />
      <Mensaje e={actualizar.error} />
      <Mensaje e={mover.error} />
      {motivos.data && (
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Descripción</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="solo-lectores">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {motivos.data.map((m, i) => (
              <tr key={m.id}>
                <td className="tabular">{m.codigo}</td>
                <td>{m.descripcion}</td>
                <td>
                  <EstadoActivo activo={m.activo} />
                </td>
                <td>
                  <div className="fila">
                    <button
                      className="bh-icono-boton"
                      disabled={i === 0 || mover.isPending}
                      onClick={() => mover.mutate({ id: m.id, direccion: 'arriba' })}
                      aria-label={`Subir el motivo ${m.descripcion}`}
                    >
                      <ArrowUp size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      className="bh-icono-boton"
                      disabled={i === n - 1 || mover.isPending}
                      onClick={() => mover.mutate({ id: m.id, direccion: 'abajo' })}
                      aria-label={`Bajar el motivo ${m.descripcion}`}
                    >
                      <ArrowDown size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      className="bh-boton bh-boton--secundario"
                      disabled={actualizar.isPending}
                      onClick={() => actualizar.mutate({ id: m.id, activo: !m.activo })}
                      aria-label={`${m.activo ? 'Desactivar' : 'Activar'} el motivo ${m.descripcion}`}
                    >
                      {m.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form className="filtros" onSubmit={enviar} aria-label="Agregar motivo">
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="mo-codigo">
            Código del motivo
          </label>
          <input
            id="mo-codigo"
            className="bh-input"
            value={codigo}
            maxLength={30}
            onChange={(e) => setCodigo(e.target.value)}
          />
        </div>
        <div className="bh-campo">
          <label className="bh-campo__label" htmlFor="mo-desc">
            Descripción del motivo
          </label>
          <input
            id="mo-desc"
            className="bh-input"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>
        <button
          className="bh-boton bh-boton--primario"
          type="submit"
          disabled={crear.isPending || codigo.trim() === '' || descripcion.trim() === ''}
        >
          Agregar motivo
        </button>
      </form>
      <Mensaje e={crear.error} />
    </>
  );
}

// ---------------------------------------------------------------------------------- plantillas

function Plantillas() {
  const p = usePlantillas();
  return (
    <>
      <h2>Plantillas de WhatsApp</h2>
      {p.isPending && <p role="status">Cargando plantillas…</p>}
      <Mensaje e={p.error} />
      {p.data && (
        <>
          <p className="texto-secundario">{p.data.nota}</p>
          <div className="tarjetas">
            {p.data.plantillas.map((t) => (
              <article className="tarjeta" key={t.clave}>
                <h3 className="texto-secundario">
                  {t.clave === 'confirmacion' ? 'Confirmación' : 'Recordatorio'} ·{' '}
                  <span className="tabular">{t.nombre}</span> ({t.idioma})
                </h3>
                <p className="texto-plantilla">{t.texto}</p>
                <p className="texto-ayuda">Botones: {t.botones.join(' · ')}</p>
              </article>
            ))}
          </div>
          <p className="texto-ayuda">
            Variables: {p.data.parametros.join(', ')}. Los mensajes nunca incluyen el nombre del
            paciente, el profesional ni la prestación.
          </p>
        </>
      )}
    </>
  );
}

// ----------------------------------------------------------------------------------- usuarios

function FilaUsuario({ u, centros }: { u: UsuarioAdmin; centros: CentroAdmin[] }) {
  const editar = useEditarUsuario();
  const [rol, setRol] = useState<Rol | ''>(u.rol ?? '');
  const [centro, setCentro] = useState(u.centro ?? '');
  const cambioPendiente = rol !== (u.rol ?? '') || centro !== (u.centro ?? '');
  const guardar = () =>
    editar.mutate({
      id: u.id,
      ...(rol !== '' && rol !== u.rol ? { rol } : {}),
      ...(rol === 'funcionaria' ? { centro } : {}),
    });
  return (
    <tr>
      <td>
        {u.nombre}
        <span className="motivo-no tabular">{u.username}</span>
        {u.esYo && <span className="motivo-no">(tú)</span>}
      </td>
      <td>
        <select
          className="bh-input"
          aria-label={`Rol de ${u.nombre}`}
          value={rol}
          onChange={(e) => setRol(e.target.value as Rol | '')}
        >
          {u.rol === null && <option value="">Sin rol</option>}
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ETIQUETA_ROL[r]}
            </option>
          ))}
        </select>
      </td>
      <td>
        {rol === 'funcionaria' ? (
          <select
            className="bh-input"
            aria-label={`Centro de ${u.nombre}`}
            value={centro}
            onChange={(e) => setCentro(e.target.value)}
          >
            <option value="">Elegir centro…</option>
            {centros
              .filter((c) => c.activo || c.codigo === u.centro)
              .map((c) => (
                <option key={c.id} value={c.codigo}>
                  {c.nombre}
                </option>
              ))}
          </select>
        ) : (
          <span className="texto-secundario">Todos</span>
        )}
      </td>
      <td>
        <EstadoActivo activo={u.activo} />
      </td>
      <td>
        <div className="fila">
          <button
            className="bh-boton bh-boton--primario"
            disabled={
              !cambioPendiente || editar.isPending || (rol === 'funcionaria' && centro === '')
            }
            onClick={guardar}
            aria-label={`Guardar los cambios de ${u.nombre}`}
          >
            Guardar
          </button>
          <button
            className="bh-boton bh-boton--secundario"
            disabled={u.esYo || editar.isPending}
            onClick={() => editar.mutate({ id: u.id, activo: !u.activo })}
            aria-label={`${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombre}`}
          >
            {u.activo ? 'Desactivar' : 'Activar'}
          </button>
          <Mensaje e={editar.error} />
        </div>
      </td>
    </tr>
  );
}

function Usuarios() {
  const usuarios = useUsuariosAdmin();
  const centros = useCentrosAdmin();
  return (
    <>
      <h2>Usuarios</h2>
      {usuarios.isPending && <p role="status">Cargando usuarios…</p>}
      <Mensaje e={usuarios.error} />
      {usuarios.data && !usuarios.data.habilitado && (
        <p className="aviso">
          La gestión de usuarios no está configurada en este ambiente. Los usuarios se administran
          directamente en Keycloak.
        </p>
      )}
      {usuarios.data?.habilitado && (
        <>
          <p className="texto-secundario">
            Contraseñas y acceso se administran en Keycloak; aquí se asigna el rol y el centro. Al
            guardar, se cierra la sesión del usuario para que el cambio rija de inmediato.
          </p>
          <TablaScroll etiqueta="Usuarios del sistema">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Usuario</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Centro</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="solo-lectores">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {usuarios.data.usuarios.map((u) => (
                  <FilaUsuario
                    key={`${u.id}:${u.rol}:${u.centro}`}
                    u={u}
                    centros={centros.data ?? []}
                  />
                ))}
              </tbody>
            </table>
          </TablaScroll>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------- demo

function Demo() {
  const estado = useEstadoDemo();
  const restablecer = useRestablecerDemo();
  const [sembrar, setSembrar] = useState(true);
  const [texto, setTexto] = useState('');
  if (!estado.data?.disponible) return null;
  return (
    <>
      <h2>Datos de demostración</h2>
      <div className="zona-peligro">
        <p>
          <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" /> Restablecer borra las
          citas, pacientes, mensajes, llamadas y cargas de todos los centros. Se conservan los
          centros, motivos, parámetros, usuarios y la bitácora de auditoría. Solo existe en el
          ambiente DEMO.
        </p>
        <label className="casilla">
          <input type="checkbox" checked={sembrar} onChange={(e) => setSembrar(e.target.checked)} />{' '}
          Cargar citas ficticias de ejemplo después de borrar
        </label>
        <div className="filtros">
          <div className="bh-campo">
            <label className="bh-campo__label" htmlFor="demo-conf">
              Escribe RESTABLECER para confirmar
            </label>
            <input
              id="demo-conf"
              className="bh-input"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button
            className="bh-boton bh-boton--primario"
            disabled={texto !== 'RESTABLECER' || restablecer.isPending}
            onClick={() => restablecer.mutate(sembrar, { onSuccess: () => setTexto('') })}
          >
            Restablecer datos demo
          </button>
        </div>
        <Mensaje e={restablecer.error} />
        {restablecer.data && (
          <p className="exito" role="status">
            Listo: se borraron {restablecer.data.citas} citas y {restablecer.data.pacientes}{' '}
            pacientes
            {restablecer.data.citasSembradas > 0
              ? `; se cargaron ${restablecer.data.citasSembradas} citas ficticias.`
              : '.'}
          </p>
        )}
      </div>
    </>
  );
}

export function Configuracion() {
  return (
    <section className="pagina" aria-labelledby="t-config">
      <h1 id="t-config">Configuración</h1>
      <Centros />
      <Motivos />
      <Plantillas />
      <Usuarios />
      <Parametros />
      <Demo />
    </section>
  );
}
