import type { ReactNode } from 'react';
import type { Modulo } from '@bh/shared';
import { ETIQUETA_MODULO } from '@bh/shared';
import { useMe } from '../api/consultas';

/** Si el rol no incluye el módulo, muestra "Sin acceso" (la API de todos modos lo rechazaría). */
export function ConAcceso({ modulo, children }: { modulo: Modulo; children: ReactNode }) {
  const me = useMe();
  if (!me.data) return null;
  if (!me.data.modulos.includes(modulo)) {
    return (
      <section className="pagina" role="alert">
        <h1>Sin acceso</h1>
        <p className="texto-secundario">
          Tu rol ({me.data.rolEtiqueta}) no tiene acceso a «{ETIQUETA_MODULO[modulo]}». Si lo
          necesitas, pídele a un administrador que revise tu rol.
        </p>
      </section>
    );
  }
  return <>{children}</>;
}
