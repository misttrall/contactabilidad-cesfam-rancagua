export type Ambiente = 'DEMO' | 'QA' | 'PRODUCCION';

const TEXTO: Record<Exclude<Ambiente, 'PRODUCCION'>, string> = {
  DEMO: 'DEMO · Datos ficticios · No es un sistema oficial del CESFAM',
  QA: 'QA · Ambiente de pruebas',
};

/** RNF-02: aviso permanente fuera de producción. En PRODUCCION no renderiza nada. */
export function BannerAmbiente({ ambiente }: { ambiente: Ambiente }) {
  if (ambiente === 'PRODUCCION') return null;
  return (
    <div className={`bh-ambiente bh-ambiente--${ambiente.toLowerCase()}`} role="status">
      {TEXTO[ambiente]}
    </div>
  );
}

export function leerAmbiente(valor: string | undefined): Ambiente {
  return valor === 'QA' || valor === 'PRODUCCION' ? valor : 'DEMO';
}
