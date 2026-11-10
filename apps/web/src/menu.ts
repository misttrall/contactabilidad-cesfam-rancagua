import {
  BarChart3,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  PhoneCall,
  PhoneIncoming,
  Send,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { ETIQUETA_MODULO, type Modulo } from '@bh/shared';

export interface ItemMenu {
  modulo: Modulo;
  ruta: string;
  etiqueta: string;
  icono: LucideIcon;
  /** Sprint del plan en que se implementa el módulo (para el aviso "en construcción"). */
  sprint?: string;
}

export const MENU: readonly ItemMenu[] = [
  {
    modulo: 'dashboard',
    ruta: '/',
    etiqueta: ETIQUETA_MODULO.dashboard,
    icono: LayoutDashboard,
    sprint: 'S5',
  },
  {
    modulo: 'cargar_citas',
    ruta: '/cargas',
    etiqueta: ETIQUETA_MODULO.cargar_citas,
    icono: FileSpreadsheet,
    sprint: 'S2',
  },
  {
    modulo: 'confirmacion_masiva',
    ruta: '/confirmaciones',
    etiqueta: ETIQUETA_MODULO.confirmacion_masiva,
    icono: Send,
    sprint: 'S3',
  },
  {
    modulo: 'pendientes',
    ruta: '/pendientes',
    etiqueta: ETIQUETA_MODULO.pendientes,
    icono: PhoneCall,
    sprint: 'S4',
  },
  {
    modulo: 'llamada_entrante',
    ruta: '/llamadas/nueva',
    etiqueta: ETIQUETA_MODULO.llamada_entrante,
    icono: PhoneIncoming,
    sprint: 'S4',
  },
  {
    modulo: 'historial',
    ruta: '/llamadas',
    etiqueta: ETIQUETA_MODULO.historial,
    icono: History,
    sprint: 'S4',
  },
  {
    modulo: 'reportes',
    ruta: '/reportes',
    etiqueta: ETIQUETA_MODULO.reportes,
    icono: BarChart3,
    sprint: 'S5',
  },
  {
    modulo: 'configuracion',
    ruta: '/configuracion',
    etiqueta: ETIQUETA_MODULO.configuracion,
    icono: Settings,
  },
];

/** El menú muestra solo lo que la API permite (la API igual lo vuelve a exigir). */
export function itemsVisibles(modulos: readonly Modulo[]): ItemMenu[] {
  return MENU.filter((i) => modulos.includes(i.modulo));
}
