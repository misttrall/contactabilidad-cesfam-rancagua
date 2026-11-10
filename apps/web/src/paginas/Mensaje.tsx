import type { ReactNode } from 'react';
import { BannerAmbiente } from '@bh/ui';
import { config } from '../config';

/** Pantalla simple de estado (cargando, error, sin acceso). Usa texto, no solo color. */
export function Mensaje({
  titulo,
  detalle,
  tono = 'neutro',
  children,
}: {
  titulo: string;
  detalle?: string;
  tono?: 'neutro' | 'error';
  children?: ReactNode;
}) {
  return (
    <>
      <BannerAmbiente ambiente={config.ambiente} />
      <div className={`mensaje mensaje--${tono}`} role={tono === 'error' ? 'alert' : 'status'}>
        <h1>{titulo}</h1>
        {detalle && <p>{detalle}</p>}
        {children}
      </div>
    </>
  );
}
