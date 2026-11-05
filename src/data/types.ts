export type Rol = 'funcionaria' | 'encargado' | 'administrador';

export type EstadoConfirmacion =
  | 'sin_enviar'
  | 'enviado'
  | 'confirmado'
  | 'cancelado'
  | 'sin_respuesta';

export type Centro = {
  id: string;
  nombre: string;
  codigo: string;
};

export type Paciente = {
  rut: string;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  telefono: string;
  edad: number;
  sexo: 'M' | 'F';
  direccion?: string;
};

export type Cita = {
  id: string;
  centroId: string;
  centroNombre: string;
  paciente: Paciente;
  fecha: string;
  hora: string;
  profesional: string;
  prestacion: string;
  tipo: 'cronico' | 'morbilidad';
  estadoConfirmacion: EstadoConfirmacion;
  fechaEnvio?: string;
  fechaRespuesta?: string;
  fechaLlamado?: string;
  atendidoPor?: string;
  observacion?: string;
  formaContacto?: 'whatsapp' | 'llamada';
};

export type MotivoLlamada = {
  id: string;
  codigo: string;
  descripcion: string;
  activo: boolean;
};

export type LlamadaEntrante = {
  id: string;
  fecha: string;
  hora: string;
  centroId: string;
  centroNombre: string;
  paciente: Paciente;
  motivoId: string;
  motivoDescripcion: string;
  otroMotivo?: string;
  observacion?: string;
  atendidoPor: string;
};

export type Usuario = {
  id: string;
  nombre: string;
  apellido: string;
  rol: Rol;
  centroId?: string;
  activo: boolean;
};
