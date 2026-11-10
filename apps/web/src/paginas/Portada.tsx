import { LogIn } from 'lucide-react';
import { BannerAmbiente } from '@bh/ui';
import { useAuth } from '../auth/AuthProvider';
import { config } from '../config';

/** Pantalla previa al login: el acceso es siempre por Keycloak (cuenta institucional). */
export function Portada() {
  const { estado, error, iniciarSesion } = useAuth();
  return (
    <>
      <BannerAmbiente ambiente={config.ambiente} />
      <div className="portada">
        <section className="portada__tarjeta" aria-labelledby="t-portada">
          <h1 id="t-portada">BusinessHub Salud</h1>
          <p className="texto-secundario">
            Contactabilidad de pacientes · Cesfam de Rancagua. Funciona junto a AVIS, no lo
            reemplaza.
          </p>
          {estado === 'error' && (
            <p className="mensaje-error" role="alert">
              No se pudo iniciar sesión{error ? `: ${error}` : ''}. Vuelve a intentarlo.
            </p>
          )}
          <button className="bh-boton bh-boton--primario" onClick={iniciarSesion} autoFocus>
            <LogIn size={16} strokeWidth={1.75} aria-hidden="true" />
            Ingresar con tu cuenta
          </button>
        </section>
      </div>
    </>
  );
}
