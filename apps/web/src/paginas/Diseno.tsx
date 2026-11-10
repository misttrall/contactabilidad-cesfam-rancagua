import { useState } from 'react';
import { ESTADOS_CITA, enmascararRut, enmascararTelefono, formatearRut } from '@bh/shared';
import { EstadoCitaBadge, RutInput } from '@bh/ui';

const RUT_DEMO = '1000001-7';

/** Catálogo del design system, solo fuera de producción (ver router). */
export function Diseno() {
  const [buscado, setBuscado] = useState<string | null>(null);
  return (
    <section className="pagina" aria-labelledby="t-diseno">
      <h1 id="t-diseno">Sistema de diseño clínico</h1>
      <p className="texto-secundario">
        Catálogo de componentes base. Fuente: skill <code>diseno-clinico-avis</code>.
      </p>

      <h2>Estados de la cita</h2>
      <div className="fila">
        {ESTADOS_CITA.map((e) => (
          <EstadoCitaBadge key={e} estado={e} />
        ))}
        <EstadoCitaBadge estado="sin_respuesta" subestado="recado" />
        <EstadoCitaBadge estado="sin_respuesta" subestado="no_ubicado" />
      </div>
      <p className="aviso">
        Regla de negocio: «Sin respuesta» nunca cancela la hora. Se muestra en ámbar, no en rojo.
      </p>

      <h2>Búsqueda por RUT</h2>
      <div className="rut-demo">
        <RutInput onBuscar={setBuscado} />
      </div>
      <p className="texto-secundario tabular">
        Prueba con <code>{formatearRut(RUT_DEMO)}</code> (RUT ficticio válido). En listas:{' '}
        {enmascararRut(RUT_DEMO)} · {enmascararTelefono('+56900000001')}
      </p>
      {buscado && <p role="status">Buscando paciente {enmascararRut(buscado)}…</p>}
    </section>
  );
}
