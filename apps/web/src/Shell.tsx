import { Link, Outlet } from '@tanstack/react-router';
import { Building2, LogOut, PanelLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BannerAmbiente } from '@bh/ui';
import { useMe } from './api/consultas';
import { useAuth } from './auth/AuthProvider';
import { config } from './config';
import { itemsVisibles } from './menu';
import { Mensaje } from './paginas/Mensaje';

/** Ancho bajo el cual se asume convivencia con AVIS en media pantalla (skill §4). */
const LADO_A_LADO = 960;

function usaLadoALado() {
  return typeof window !== 'undefined' && window.innerWidth <= LADO_A_LADO;
}

export function Shell() {
  const { cerrarSesion } = useAuth();
  const me = useMe();
  const [colapsado, setColapsado] = useState(usaLadoALado);

  useEffect(() => {
    const alRedimensionar = () => {
      if (usaLadoALado()) setColapsado(true);
    };
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, []);

  if (me.isPending) return <Mensaje titulo="Cargando tu sesión…" />;
  if (me.isError) {
    return (
      <Mensaje titulo="No pudimos validar tu acceso" tono="error" detalle={me.error.message}>
        <button className="bh-boton" onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </Mensaje>
    );
  }

  const usuario = me.data;
  const items = itemsVisibles(usuario.modulos);

  return (
    <div className="shell" data-colapsado={colapsado}>
      <BannerAmbiente ambiente={config.ambiente} />
      <header className="shell__header">
        <button
          className="bh-icono-boton"
          aria-label={colapsado ? 'Expandir menú' : 'Contraer menú'}
          aria-expanded={!colapsado}
          onClick={() => setColapsado(!colapsado)}
        >
          <PanelLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <strong className="shell__marca">BusinessHub Salud</strong>
        <span className="shell__centro">
          <Building2 size={16} strokeWidth={1.75} aria-hidden="true" />
          {usuario.centro ? usuario.centro.nombre : 'Todos los centros'}
        </span>
        <span className="shell__espaciador" />
        <span className="shell__usuario">
          <span>{usuario.nombre}</span>
          <span className="shell__rol">{usuario.rolEtiqueta}</span>
        </span>
        <button
          className="bh-boton bh-boton--secundario"
          onClick={cerrarSesion}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="shell__salir">Cerrar sesión</span>
        </button>
      </header>
      <nav className="shell__menu" aria-label="Principal">
        <ul>
          {items.map(({ ruta, etiqueta, icono: Icono }) => (
            <li key={ruta}>
              <Link
                to={ruta}
                className="shell__enlace"
                activeProps={{ 'aria-current': 'page', 'data-activo': 'true' }}
                activeOptions={{ exact: ruta === '/' || ruta === '/llamadas' }}
                title={colapsado ? etiqueta : undefined}
              >
                <Icono size={20} strokeWidth={1.75} aria-hidden="true" />
                <span className="shell__etiqueta">{etiqueta}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="shell__contenido">
        <Outlet />
      </main>
    </div>
  );
}
