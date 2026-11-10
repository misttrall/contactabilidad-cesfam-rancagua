import { useId, useState } from 'react';
import { esRutValido, formatearRut, normalizarRut } from '@bh/shared';

export interface RutInputProps {
  /** Se llama con el RUT normalizado (12345678-5) cuando es válido, o null si no. */
  onChange?: (rutNormalizado: string | null) => void;
  /** Enter con RUT válido. */
  onBuscar?: (rutNormalizado: string) => void;
  autoFocus?: boolean;
}

/** Máscara en vivo y validación módulo 11 (skill: componentes.md). */
export function RutInput({ onChange, onBuscar, autoFocus }: RutInputProps) {
  const id = useId();
  const [valor, setValor] = useState('');
  const [tocado, setTocado] = useState(false);
  const valido = esRutValido(valor);
  const error = tocado && valor !== '' && !valido;

  const actualizar = (crudo: string) => {
    const limpio = crudo.replace(/[^0-9kK]/g, '').slice(0, 9);
    const mostrado = limpio.length > 1 ? formatearRut(limpio) : limpio;
    setValor(mostrado);
    onChange?.(normalizarRut(mostrado));
  };

  return (
    <div className="bh-campo">
      <label htmlFor={id} className="bh-campo__label">
        RUT del paciente
      </label>
      <input
        id={id}
        className="bh-input bh-input--rut tabular"
        value={valor}
        inputMode="text"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-invalid={error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => actualizar(e.target.value)}
        onBlur={() => setTocado(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setTocado(true);
            const n = normalizarRut(valor);
            if (n) onBuscar?.(n);
          }
        }}
      />
      {error && (
        <p id={`${id}-error`} className="bh-campo__error" aria-live="polite">
          RUT no válido: revisa el dígito verificador
        </p>
      )}
    </div>
  );
}
