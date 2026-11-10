import {
  CircleCheck,
  CircleDashed,
  CircleX,
  MessageSquareDot,
  PhoneMissed,
  Send,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import type { EstadoCita, SubestadoSinRespuesta } from '@bh/shared';
import { ETIQUETA_ESTADO } from '@bh/shared';

/** Mapeo único estado -> ícono (skill diseno-clinico-avis §3). Color + ícono + texto, nunca solo color. */
const ICONO: Record<EstadoCita, LucideIcon> = {
  sin_enviar: CircleDashed,
  enviado: Send,
  confirmado: CircleCheck,
  sin_respuesta: PhoneMissed,
  cancelado: CircleX,
};

const SUBESTADO: Record<SubestadoSinRespuesta, { icono: LucideIcon; texto: string }> = {
  recado: { icono: MessageSquareDot, texto: 'Recado dejado' },
  no_ubicado: { icono: UserX, texto: 'No ubicado' },
};

export interface EstadoCitaBadgeProps {
  estado: EstadoCita;
  subestado?: SubestadoSinRespuesta;
  size?: 'sm' | 'md';
}

export function EstadoCitaBadge({ estado, subestado, size = 'md' }: EstadoCitaBadgeProps) {
  const sub = estado === 'sin_respuesta' && subestado ? SUBESTADO[subestado] : undefined;
  const Icono = sub?.icono ?? ICONO[estado];
  const texto = sub?.texto ?? ETIQUETA_ESTADO[estado];
  return (
    <span className={`bh-badge bh-badge--${estado} bh-badge--${size}`} data-estado={estado}>
      <Icono size={14} strokeWidth={1.75} aria-hidden="true" />
      <span>{texto}</span>
    </span>
  );
}
