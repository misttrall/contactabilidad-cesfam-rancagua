import { Hammer } from 'lucide-react';
import { ETIQUETA_MODULO, type Modulo } from '@bh/shared';
import { MENU } from '../menu';

export function EnConstruccion({ modulo }: { modulo: Modulo }) {
  const sprint = MENU.find((i) => i.modulo === modulo)?.sprint;
  return (
    <section className="pagina" aria-labelledby="t-obra">
      <h1 id="t-obra">{ETIQUETA_MODULO[modulo]}</h1>
      <p className="aviso">
        <Hammer size={16} strokeWidth={1.75} aria-hidden="true" /> Este módulo se construye
        {sprint ? ` en el Sprint ${sprint.replace('S', '')}` : ' próximamente'} del MVP. Mientras
        tanto sigue usando tu proceso habitual con AVIS.
      </p>
    </section>
  );
}
