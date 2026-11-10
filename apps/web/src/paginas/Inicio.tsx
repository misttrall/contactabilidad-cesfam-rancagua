import { Building2, ShieldCheck } from 'lucide-react';
import { useMe } from '../api/consultas';

export function Inicio() {
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <section className="pagina" aria-labelledby="t-inicio">
      <h1 id="t-inicio">Hola, {me.nombre}</h1>
      <div className="tarjetas">
        <article className="tarjeta">
          <h2>
            <Building2 size={16} strokeWidth={1.75} aria-hidden="true" /> Tu centro
          </h2>
          <p>{me.centro ? me.centro.nombre : 'Todos los centros'}</p>
        </article>
        <article className="tarjeta">
          <h2>
            <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" /> Tu rol
          </h2>
          <p>{me.rolEtiqueta}</p>
        </article>
      </div>
      <p className="aviso">
        Los indicadores del día (citas cargadas, confirmadas, sin respuesta y llamadas entrantes) se
        habilitan en el Sprint 5. Por ahora puedes revisar los módulos del menú.
      </p>
    </section>
  );
}
