import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Panel lateral derecho (drawer) sobre `<dialog>`: el navegador atrapa el foco, cierra con Esc y
 * lo devuelve al elemento que lo abrió. Se usa para el detalle de un paciente sin perder la lista.
 */
export function Panel({
  abierto,
  onCerrar,
  titulo,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
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
    <dialog ref={ref} className="panel-lateral" aria-labelledby={idTitulo} onClose={onCerrar}>
      <header className="panel-lateral__cabecera">
        <h2 id={idTitulo}>{titulo}</h2>
        <button className="bh-icono-boton" onClick={onCerrar} aria-label="Cerrar panel">
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>
      <div className="panel-lateral__cuerpo">{children}</div>
    </dialog>
  );
}
