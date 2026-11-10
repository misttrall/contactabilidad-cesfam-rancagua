import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Modulo, Rol } from '@bh/shared';
import { apiFetch } from './cliente';

export interface Me {
  id: string;
  nombre: string;
  rol: Rol;
  rolEtiqueta: string;
  centro: { id: string; codigo: string; nombre: string } | null;
  modulos: Modulo[];
}
export interface Centro {
  id: string;
  codigo: string;
  nombre: string;
}
export interface Motivo {
  id: string;
  codigo: string;
  descripcion: string;
  orden: number;
  activo: boolean;
}

export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<Me>('/api/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });

export const useCentros = () =>
  useQuery({ queryKey: ['centros'], queryFn: () => apiFetch<Centro[]>('/api/centros') });

export const useMotivosAdmin = () =>
  useQuery({
    queryKey: ['motivos-admin'],
    queryFn: () => apiFetch<Motivo[]>('/api/config/motivos'),
  });

export function useActualizarMotivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...cambios }: { id: string; activo?: boolean; descripcion?: string }) =>
      apiFetch<Motivo>(`/api/config/motivos/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(cambios),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['motivos-admin'] }),
  });
}

// ------------------------------------------------------------------------------ Cargas (S2)

export interface ErrorFilaApi {
  fila: number;
  columna: string;
  mensaje: string;
}
export interface ResumenValidacion {
  totalFilas: number;
  validas: number;
  citasNuevas: number;
  citasYaCargadas: number;
  excluidasMorbilidad: number;
  repetidasEnArchivo: number;
  erroresTotal: number;
  errores: ErrorFilaApi[];
  columnasReconocidas: string[];
  columnasIgnoradas: string[];
  vistaPrevia: {
    paciente: string;
    rut: string;
    telefono: string;
    fecha: string;
    hora: string;
    profesional: string;
    prestacion: string;
    tipo: string;
  }[];
  limites: { maxFilas: number; maxMegabytes: number };
}
export interface ResultadoImportacion {
  cargaId: string;
  filasTotales: number;
  citasCreadas: number;
  citasExistentes: number;
  pacientesNuevos: number;
  pacientesActualizados: number;
  morbilidadExcluida: number;
  repetidasEnArchivo: number;
  erroresTotal: number;
}
export interface ResumenCargas {
  opciones: { excluirMorbilidadPorDefecto: boolean; maxFilas: number; maxMegabytes: number };
  historial: {
    id: string;
    creadaEn: string;
    filasTotales: number;
    citasCreadas: number;
    citasExistentes: number;
    erroresTotal: number;
    centro: { codigo: string };
  }[];
}

export const useResumenCargas = () =>
  useQuery({ queryKey: ['cargas'], queryFn: () => apiFetch<ResumenCargas>('/api/cargas') });

interface ParamsCarga {
  archivo: File;
  centro: string;
  excluirMorbilidad: boolean;
}
const formulario = ({ archivo, centro, excluirMorbilidad }: ParamsCarga) => {
  const f = new FormData();
  f.append('centro', centro);
  f.append('excluirMorbilidad', String(excluirMorbilidad));
  f.append('archivo', archivo); // el archivo va al final del formulario
  return f;
};

export const useValidarPlanilla = () =>
  useMutation({
    mutationFn: (p: ParamsCarga) =>
      apiFetch<ResumenValidacion>('/api/cargas/validar', { method: 'POST', body: formulario(p) }),
  });

export function useImportarPlanilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: ParamsCarga) =>
      apiFetch<ResultadoImportacion>('/api/cargas', { method: 'POST', body: formulario(p) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cargas'] }),
  });
}
