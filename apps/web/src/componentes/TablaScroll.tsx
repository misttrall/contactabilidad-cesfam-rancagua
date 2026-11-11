import type { ReactNode } from 'react';

/**
 * Contenedor de una tabla ancha con desplazamiento horizontal. Para que sea accesible por teclado
 * (WCAG 2.1.1: axe `scrollable-region-focusable`) debe poder recibir el foco y tener nombre:
 * se expone como región con la etiqueta de la tabla que contiene.
 */
export function TablaScroll({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="tabla-scroll" role="region" tabIndex={0} aria-label={etiqueta}>
      {children}
    </div>
  );
}
