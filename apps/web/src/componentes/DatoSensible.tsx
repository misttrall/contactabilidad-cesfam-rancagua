import { Copy, Eye, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Cuánto tiempo queda visible un dato revelado (skill diseno-clinico-avis §1). */
export const SEGUNDOS_VISIBLE = 30;

/**
 * Dato sensible (teléfono o RUT) enmascarado. «Mostrar» lo pide al servidor — que lo deja en la
 * auditoría — y lo oculta solo a los 30 s. Permite copiarlo para marcar desde el teléfono.
 */
export function DatoSensible({
  etiqueta,
  enmascarado,
  obtener,
}: {
  etiqueta: string;
  enmascarado: string;
  /** Devuelve el valor completo (null si no existe). Se invoca solo al pulsar «Mostrar». */
  obtener: () => Promise<string | null>;
}) {
  const [valor, setValor] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const ocultar = () => {
    clearTimeout(temporizador.current);
    setValor(null);
    setCopiado(false);
  };
  const mostrar = async () => {
    setCargando(true);
    setError(null);
    try {
      const v = await obtener();
      setValor(v ?? '—');
      temporizador.current = setTimeout(ocultar, SEGUNDOS_VISIBLE * 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo mostrar el dato');
    } finally {
      setCargando(false);
    }
  };
  const copiar = async () => {
    if (valor && valor !== '—') {
      try {
        await navigator.clipboard?.writeText(valor);
        setCopiado(true);
      } catch {
        setError('No se pudo copiar: selecciónalo y cópialo a mano');
      }
    }
  };

  return (
    <div className="dato-sensible">
      <span className="bh-campo__label">{etiqueta}</span>
      <span className="dato-sensible__fila">
        <span className="tabular dato-sensible__valor" aria-live="polite">
          {valor ?? enmascarado}
        </span>
        {valor === null ? (
          <button
            className="bh-boton bh-boton--secundario"
            onClick={mostrar}
            disabled={cargando}
            aria-label={`Mostrar ${etiqueta.toLowerCase()} completo`}
          >
            <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
            {cargando ? 'Mostrando…' : 'Mostrar'}
          </button>
        ) : (
          <>
            <button
              className="bh-boton bh-boton--secundario"
              onClick={copiar}
              aria-label={`Copiar ${etiqueta.toLowerCase()}`}
            >
              <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <button
              className="bh-boton bh-boton--secundario"
              onClick={ocultar}
              aria-label={`Ocultar ${etiqueta.toLowerCase()}`}
            >
              <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />
              Ocultar
            </button>
          </>
        )}
      </span>
      {valor !== null && (
        <span className="texto-secundario dato-sensible__nota">
          Se oculta solo en {SEGUNDOS_VISIBLE} s. Este acceso quedó registrado.
        </span>
      )}
      {error && (
        <span className="mensaje-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
