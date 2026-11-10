import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Modulo, Rol } from '@bh/shared';
import { apiBlob, apiFetch } from './cliente';

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

// ------------------------------------------------------------------ Confirmación masiva (S3)

export type EstadoCitaApi = 'sin_enviar' | 'enviado' | 'confirmado' | 'sin_respuesta' | 'cancelado';
export type TipoFiltro = 'cronico' | 'morbilidad' | 'todos';

export interface FilaConfirmacion {
  id: string;
  hora: string;
  paciente: string;
  rut: string;
  telefono: string | null;
  profesional: string;
  prestacion: string;
  tipo: 'cronico' | 'morbilidad';
  estado: EstadoCitaApi;
  subestado: 'recado' | 'no_ubicado' | null;
  adultoMayor: boolean;
  seleccionable: boolean;
  motivoNoSeleccionable: 'ya_enviada' | 'baja' | 'sin_telefono' | null;
}
export interface ListadoConfirmaciones {
  opciones: {
    modo: 'simulador' | 'cloud';
    puedeSimular: boolean;
    anticipacionHoras: number;
    ventana: { desde: string; hasta: string };
    horasEspera: number;
    fechaSugerida: string;
  };
  resumen: Record<EstadoCitaApi, number>;
  filas: FilaConfirmacion[];
  truncado: boolean;
}
export interface PrevisualizacionEnvio {
  aEnviar: number;
  sinTelefono: number;
  baja: number;
  yaEnviadasOEnOtroEstado: number;
  mensaje: string | null;
  programadoPara: string | null;
  ventana: { desde: string; hasta: string };
}
export interface ResultadoEnvio {
  envioId: string;
  solicitadas: number;
  encoladas: number;
  omitidasSinTelefono: number;
  omitidasBaja: number;
  omitidasEstado: number;
  programadoPara: string | null;
}
export interface ProgresoEnvio {
  id: string;
  solicitadas: number;
  encoladas: number;
  omitidasSinTelefono: number;
  omitidasBaja: number;
  omitidasEstado: number;
  mensajes: { en_cola: number; enviado: number; entregado: number; leido: number; fallido: number };
  terminado: boolean;
}
export interface Liberacion {
  id: string;
  fecha: string;
  hora: string;
  paciente: string;
  rut: string;
  profesional: string;
  centro: string;
}

export function useConfirmaciones(p: { centro: string; fecha: string; tipo: TipoFiltro }) {
  const q = new URLSearchParams({
    fecha: p.fecha,
    tipo: p.tipo,
    ...(p.centro ? { centro: p.centro } : {}),
  });
  return useQuery({
    queryKey: ['confirmaciones', p.centro, p.fecha, p.tipo],
    queryFn: () => apiFetch<ListadoConfirmaciones>(`/api/confirmaciones?${q}`),
    // Sin centro (encargado/administrador que aún no eligió) no se consulta: la API respondería 400.
    enabled: p.centro !== '' && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha),
    // Las respuestas de los pacientes llegan solas (webhook): la lista se actualiza sin recargar.
    refetchInterval: 15_000,
  });
}

interface ParamsEnvio {
  centro: string;
  citaIds: string[];
}
export const usePrevisualizarEnvio = () =>
  useMutation({
    mutationFn: (p: ParamsEnvio) =>
      apiFetch<PrevisualizacionEnvio>('/api/envios/previsualizar', {
        method: 'POST',
        body: JSON.stringify(p),
      }),
  });

export function useCrearEnvio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: ParamsEnvio) =>
      apiFetch<ResultadoEnvio>('/api/envios', { method: 'POST', body: JSON.stringify(p) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['confirmaciones'] }),
  });
}

/** Consulta el avance cada 2 s hasta que no queden mensajes en cola. */
export const useProgresoEnvio = (envioId: string | null) =>
  useQuery({
    queryKey: ['envio', envioId],
    queryFn: () => apiFetch<ProgresoEnvio>(`/api/envios/${envioId}`),
    enabled: envioId !== null,
    refetchInterval: (q) => (q.state.data?.terminado ? false : 2000),
  });

export function useSimularRespuestas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (centro: string) =>
      apiFetch<{
        confirmadas: number;
        canceladas: number;
        bajas: number;
        sinResponder: number;
        sinEntregar: number;
      }>('/api/envios/simular-respuestas', { method: 'POST', body: JSON.stringify({ centro }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['confirmaciones'] });
      void qc.invalidateQueries({ queryKey: ['liberaciones'] });
    },
  });
}

export const useLiberaciones = () =>
  useQuery({
    queryKey: ['liberaciones'],
    queryFn: () => apiFetch<Liberacion[]>('/api/liberaciones'),
  });

export function useResolverLiberacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/liberaciones/${id}/resolver`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['liberaciones'] }),
  });
}

// ----------------------------------------------------------------- Parámetros de operación (S3)

export interface Parametro {
  clave: string;
  descripcion: string;
  valor: unknown;
  porDefecto: unknown;
}

export const useParametros = () =>
  useQuery({
    queryKey: ['parametros'],
    queryFn: () => apiFetch<Parametro[]>('/api/config/parametros'),
  });

export function useActualizarParametro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clave, valor }: { clave: string; valor: unknown }) =>
      apiFetch<{ clave: string }>(`/api/config/parametros/${encodeURIComponent(clave)}`, {
        method: 'PATCH',
        body: JSON.stringify({ valor }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parametros'] }),
  });
}

// ----------------------------------------------------------------- Llamadas (S4)

export type ResultadoLlamadaApi = 'confirmado' | 'recado' | 'no_ubicado' | 'cancelado';

export interface FilaPendiente {
  id: string;
  pacienteId: string;
  fecha: string;
  hora: string;
  paciente: string;
  telefono: string | null;
  profesional: string;
  prestacion: string;
  tipo: 'cronico' | 'morbilidad';
  subestado: 'recado' | 'no_ubicado' | null;
  vencida: boolean;
  adultoMayor: boolean;
  bajaWhatsApp: boolean;
  intentos: number;
  ultimoIntento: { resultado: ResultadoLlamadaApi; creadaEn: string } | null;
}

export interface ContactosCita {
  estado: EstadoCitaApi;
  subestado: 'recado' | 'no_ubicado' | null;
  mensajes: { tipo: string; estado: string; enviadoEn: string | null; leidoEn: string | null }[];
  llamadas: {
    id: string;
    resultado: ResultadoLlamadaApi;
    observacion: string | null;
    creadaEn: string;
    registradoPor: string;
  }[];
}

export const usePendientes = (centro: string) =>
  useQuery({
    queryKey: ['pendientes', centro],
    queryFn: () =>
      apiFetch<{ filas: FilaPendiente[] }>(
        `/api/pendientes${centro ? `?centro=${encodeURIComponent(centro)}` : ''}`,
      ),
    enabled: centro !== '',
    // Otras funcionarias también registran llamadas: la cola se mantiene al día.
    refetchInterval: 30_000,
  });

export const useContactos = (citaId: string | null) =>
  useQuery({
    queryKey: ['contactos', citaId],
    queryFn: () => apiFetch<ContactosCita>(`/api/pendientes/${citaId}/contactos`),
    enabled: citaId !== null,
  });

export function useRegistrarResultado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      citaId,
      ...cuerpo
    }: {
      citaId: string;
      resultado: ResultadoLlamadaApi;
      observacion?: string;
    }) =>
      apiFetch<{ estado: string; liberarEnAvis: boolean }>(`/api/pendientes/${citaId}/resultado`, {
        method: 'POST',
        body: JSON.stringify(cuerpo),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pendientes'] });
      void qc.invalidateQueries({ queryKey: ['contactos'] });
      void qc.invalidateQueries({ queryKey: ['liberaciones'] });
    },
  });
}

/** Pide el dato completo; cada llamada queda en la auditoría del servidor. */
export const useRevelar = () =>
  useMutation({
    mutationFn: ({ pacienteId, campo }: { pacienteId: string; campo: 'telefono' | 'rut' }) =>
      apiFetch<{ campo: string; valor: string | null }>(`/api/pacientes/${pacienteId}/revelar`, {
        method: 'POST',
        body: JSON.stringify({ campo }),
      }),
  });

export interface Motivo2 {
  id: string;
  codigo: string;
  descripcion: string;
}
export const useMotivos = () =>
  useQuery({
    queryKey: ['motivos'],
    queryFn: () => apiFetch<Motivo2[]>('/api/motivos'),
    staleTime: 5 * 60_000,
  });

export type BusquedaPaciente =
  | { encontrado: false }
  | {
      encontrado: true;
      paciente: {
        id: string;
        nombre: string;
        edad: number | null;
        adultoMayor: boolean;
        telefono: string | null;
      };
      proximasCitas: { fecha: string; hora: string; profesional: string; estado: EstadoCitaApi }[];
    };

export const useBuscarPaciente = (rut: string | null, centro: string) =>
  useQuery({
    queryKey: ['paciente', rut, centro],
    queryFn: () =>
      apiFetch<BusquedaPaciente>(
        `/api/pacientes/buscar?rut=${encodeURIComponent(rut ?? '')}${centro ? `&centro=${encodeURIComponent(centro)}` : ''}`,
      ),
    enabled: rut !== null && centro !== '',
    staleTime: 0,
    gcTime: 0,
  });

export function useRegistrarLlamadaEntrante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cuerpo: {
      rut: string;
      centro?: string;
      motivoId: string;
      otroMotivo?: string;
      observacion?: string;
      segundos?: number;
    }) =>
      apiFetch<{ id: string; pacienteEncontrado: boolean }>('/api/llamadas-entrantes', {
        method: 'POST',
        body: JSON.stringify(cuerpo),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['historial'] }),
  });
}

export interface FiltrosHistorialUI {
  centro: string;
  desde: string;
  hasta: string;
  motivoId: string;
  q: string;
  pagina: number;
  tam: number;
}
export interface FilaHistorial {
  id: string;
  creadaEn: string;
  centro: string;
  paciente: string | null;
  rut: string;
  motivo: string;
  otroMotivo: string | null;
  observacion: string | null;
  registradoPor: string;
  segundos: number | null;
}
export interface Historial {
  total: number;
  pagina: number;
  tam: number;
  paginas: number;
  filas: FilaHistorial[];
}

export function useHistorialLlamadas(f: FiltrosHistorialUI) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== '' && v !== undefined) q.set(k, String(v));
  return useQuery({
    queryKey: ['historial', f],
    queryFn: () => apiFetch<Historial>(`/api/llamadas-entrantes?${q}`),
    placeholderData: (anterior) => anterior,
  });
}

// ------------------------------------------------------------------------- Dashboard (S5)

export interface Dashboard {
  fecha: string;
  hoy: string;
  kpis: {
    cargadas: number;
    porEnviar: number;
    enviadas: number;
    confirmadas: number;
    sinRespuesta: number;
    canceladas: number;
    llamadasEntrantesHoy: number;
  };
  pendientesPorLlamar: number;
  liberacionesPendientes: number;
  proximasAConfirmar: { id: string; hora: string; paciente: string; tipo: string }[];
  llamadasRecientes: {
    id: string;
    creadaEn: string;
    centro: string;
    paciente: string | null;
    rut: string;
    motivo: string;
  }[];
}

export const useDashboard = (p: { centro: string; fecha: string }) =>
  useQuery({
    queryKey: ['dashboard', p],
    queryFn: () => {
      const q = new URLSearchParams();
      if (p.centro) q.set('centro', p.centro);
      if (p.fecha) q.set('fecha', p.fecha);
      return apiFetch<Dashboard>(`/api/dashboard?${q}`);
    },
    refetchInterval: 60_000,
  });

// -------------------------------------------------------------------------- Reportes (S5)

export interface FilaConfirmacion2 {
  centro: string;
  nombre: string;
  total: number;
  sin_enviar: number;
  enviado: number;
  confirmado: number;
  sin_respuesta: number;
  cancelado: number;
}
export interface ResumenReporte {
  filtros: { desde: string; hasta: string; dias: number; centro: string | null };
  confirmaciones: {
    porCentro: FilaConfirmacion2[];
    total: Omit<FilaConfirmacion2, 'centro' | 'nombre'>;
  };
  motivos: { total: number; filas: { motivo: string; llamadas: number }[] };
  edadSexo: {
    filas: { tramo: string; M: number; F: number; sinDato: number; total: number }[];
    sinPacienteIdentificado: number;
  };
  piloto: {
    proporcionConfirmadas: number | null;
    citasConWhatsapp: number;
    tasaRespuestaWhatsapp: number | null;
    respondidasPorWhatsapp: number;
    llamadasEvitadas: number;
    llamadasEvitadasPorDia: number;
    llamadasSalientes: number;
    llamadasEntrantes: number;
    tiempoRegistroEntrante: {
      registros: number;
      promedio: number;
      mediana: number;
      p90: number;
      /** % de registros bajo la meta de 30 s. */
      bajoMeta: number;
    } | null;
  };
}

const qReporte = (p: { centro: string; desde: string; hasta: string }) => {
  const q = new URLSearchParams({ desde: p.desde, hasta: p.hasta });
  if (p.centro) q.set('centro', p.centro);
  return q.toString();
};
export const useResumenReporte = (p: { centro: string; desde: string; hasta: string }) =>
  useQuery({
    queryKey: ['reporte', p],
    queryFn: () => apiFetch<ResumenReporte>(`/api/reportes/resumen?${qReporte(p)}`),
    enabled: p.desde !== '' && p.hasta !== '' && p.desde <= p.hasta,
  });
export const exportarReporte = (p: { centro: string; desde: string; hasta: string }) =>
  apiBlob(`/api/reportes/exportar?${qReporte(p)}`);

// ---------------------------------------------------------------- Configuración ampliada (S5)

export interface CentroAdmin extends Centro {
  activo: boolean;
}
export const useCentrosAdmin = () =>
  useQuery({
    queryKey: ['centros-admin'],
    queryFn: () => apiFetch<CentroAdmin[]>('/api/config/centros'),
  });
export function useCrearCentro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { codigo: string; nombre: string }) =>
      apiFetch<CentroAdmin>('/api/config/centros', { method: 'POST', body: JSON.stringify(d) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['centros-admin'] });
      void qc.invalidateQueries({ queryKey: ['centros'] });
    },
  });
}
export function useEditarCentro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: { id: string; nombre?: string; activo?: boolean }) =>
      apiFetch<CentroAdmin>(`/api/config/centros/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(d),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['centros-admin'] });
      void qc.invalidateQueries({ queryKey: ['centros'] });
    },
  });
}
export function useCrearMotivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { codigo: string; descripcion: string }) =>
      apiFetch<Motivo>('/api/config/motivos', { method: 'POST', body: JSON.stringify(d) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['motivos-admin'] }),
  });
}
export function useMoverMotivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direccion }: { id: string; direccion: 'arriba' | 'abajo' }) =>
      apiFetch<Motivo[]>(`/api/config/motivos/${id}/mover`, {
        method: 'POST',
        body: JSON.stringify({ direccion }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['motivos-admin'] }),
  });
}

export interface PlantillasConfig {
  modo: string;
  plantillas: { clave: string; nombre: string; idioma: string; texto: string; botones: string[] }[];
  parametros: string[];
  reagendamiento: string;
  nota: string;
}
export const usePlantillas = () =>
  useQuery({
    queryKey: ['plantillas'],
    queryFn: () => apiFetch<PlantillasConfig>('/api/config/plantillas'),
  });

export interface UsuarioAdmin {
  id: string;
  username: string;
  nombre: string;
  activo: boolean;
  rol: Rol | null;
  centro: string | null;
  ultimoIngreso: string | null;
  esYo: boolean;
}
export const useUsuariosAdmin = () =>
  useQuery({
    queryKey: ['usuarios-admin'],
    queryFn: () =>
      apiFetch<{ habilitado: boolean; usuarios: UsuarioAdmin[] }>('/api/config/usuarios'),
  });
export function useEditarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...d
    }: {
      id: string;
      rol?: Rol;
      centro?: string | null;
      activo?: boolean;
    }) =>
      apiFetch<UsuarioAdmin>(`/api/config/usuarios/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(d),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios-admin'] }),
  });
}

export const useEstadoDemo = () =>
  useQuery({
    queryKey: ['demo'],
    queryFn: () => apiFetch<{ disponible: boolean }>('/api/config/demo'),
  });
export function useRestablecerDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sembrar: boolean) =>
      apiFetch<{
        citas: number;
        pacientes: number;
        llamadasEntrantes: number;
        citasSembradas: number;
      }>('/api/config/demo/restablecer', {
        method: 'POST',
        body: JSON.stringify({ sembrar, confirmacion: 'RESTABLECER' }),
      }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
