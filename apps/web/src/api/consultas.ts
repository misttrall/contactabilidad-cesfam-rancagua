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
