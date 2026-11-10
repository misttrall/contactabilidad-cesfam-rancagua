import { useState } from 'react';
import { ESTADOS_CITA, enmascararRut, enmascararTelefono, formatearRut } from '@bh/shared';
import { BannerAmbiente, EstadoCitaBadge, RutInput, leerAmbiente } from '@bh/ui';

const ambiente = leerAmbiente(import.meta.env.VITE_AMBIENTE);
const RUT_DEMO = '1000001-7';

/**
 * S0: shell mínimo + catálogo del design system para validar tokens con el cliente.
 * Las pantallas reales llegan desde S1 (ver docs/mvp/PLAN_MVP.md).
 */
export function App() {
  const [buscado, setBuscado] = useState<string | null>(null);

  return (
    <>
      <BannerAmbiente ambiente={ambiente} />
      <header className="app-header">
        <strong>BusinessHub Salud</strong>
        <span className="app-header__centro">CESFAM Centro (DEMO)</span>
      </header>
      <main className="app-main">
        <h1>Sistema de diseño clínico</h1>
        <p className="texto-secundario">
          Catálogo de componentes base (Sprint 0). Fuente: skill <code>diseno-clinico-avis</code>.
        </p>

        <section aria-labelledby="h-estados">
          <h2 id="h-estados">Estados de la cita</h2>
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
        </section>

        <section aria-labelledby="h-rut">
          <h2 id="h-rut">Búsqueda por RUT</h2>
          <div className="rut-demo">
            <RutInput onBuscar={setBuscado} />
          </div>
          <p className="texto-secundario tabular">
            Prueba con <code>{formatearRut(RUT_DEMO)}</code> (RUT ficticio válido). Listas:{' '}
            {enmascararRut(RUT_DEMO)} · {enmascararTelefono('+56900000001')}
          </p>
          {buscado && <p role="status">Buscando paciente {enmascararRut(buscado)}…</p>}
        </section>
      </main>
    </>
  );
}
