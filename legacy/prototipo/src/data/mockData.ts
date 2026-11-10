import { Centro, Cita, MotivoLlamada, LlamadaEntrante, Usuario, Paciente } from './types';

export const centros: Centro[] = [
  { id: 'c1', nombre: 'CESFAM Centro', codigo: 'CSC' },
  { id: 'c2', nombre: 'CESFAM Norte', codigo: 'CSN' },
  { id: 'c3', nombre: 'CESFAM Sur', codigo: 'CSS' },
  { id: 'c4', nombre: 'CESFAM Oriente', codigo: 'CSO' },
  { id: 'c5', nombre: 'CESFAM Poniente', codigo: 'CSP' },
  { id: 'c6', nombre: 'CESFAM La Rosa', codigo: 'CSLR' },
  { id: 'c7', nombre: 'CESFAM Cachapoal', codigo: 'CSCA' },
];

export const usuarios: Usuario[] = [
  { id: 'u1', nombre: 'María', apellido: 'González', rol: 'administrador', activo: true },
  { id: 'u2', nombre: 'Patricia', apellido: 'Muñoz', rol: 'encargado', activo: true },
  { id: 'u3', nombre: 'Carolina', apellido: 'Soto', rol: 'funcionaria', centroId: 'c1', activo: true },
  { id: 'u4', nombre: 'Daniela', apellido: 'Rojas', rol: 'funcionaria', centroId: 'c2', activo: true },
  { id: 'u5', nombre: 'Andrea', apellido: 'Vera', rol: 'funcionaria', centroId: 'c3', activo: true },
];

export const motivosLlamada: MotivoLlamada[] = [
  { id: 'm1', codigo: 'SOL_HORA', descripcion: 'Solicitud de hora', activo: true },
  { id: 'm2', codigo: 'CONS_RESULT', descripcion: 'Consulta de resultados', activo: true },
  { id: 'm3', codigo: 'REAG_CITA', descripcion: 'Reagendamiento / Cambio de hora', activo: true },
  { id: 'm4', codigo: 'CAMBIO_DOM', descripcion: 'Cambio de datos / domicilio', activo: true },
  { id: 'm5', codigo: 'FARMACIA', descripcion: 'Consulta de farmacia', activo: true },
  { id: 'm6', codigo: 'CERTIFICADO', descripcion: 'Solicitud de certificado', activo: true },
  { id: 'm7', codigo: 'OTROS', descripcion: 'Otros', activo: true },
];

const generarPaciente = (rut: string, nombre: string, apellidoP: string, apellidoM: string, edad: number, sexo: 'M'|'F'): Paciente => ({
  rut,
  nombre,
  apellidoPaterno: apellidoP,
  apellidoMaterno: apellidoM,
  telefono: `+569${Math.floor(10000000 + Math.random() * 90000000)}`,
  edad,
  sexo,
});

export const citasMock: Cita[] = [
  {
    id: 'ct1', centroId: 'c1', centroNombre: 'CESFAM Centro',
    paciente: generarPaciente('12345678-9', 'Juan', 'Pérez', 'López', 68, 'M'),
    fecha: '2026-10-28', hora: '09:00', profesional: 'Dra. Martínez', prestacion: 'Control Crónico', tipo: 'cronico',
    estadoConfirmacion: 'sin_enviar'
  },
  {
    id: 'ct2', centroId: 'c1', centroNombre: 'CESFAM Centro',
    paciente: generarPaciente('98765432-1', 'María', 'González', 'Silva', 45, 'F'),
    fecha: '2026-10-28', hora: '09:30', profesional: 'Dr. Torres', prestacion: 'Control DM2', tipo: 'cronico',
    estadoConfirmacion: 'sin_enviar'
  },
  {
    id: 'ct3', centroId: 'c1', centroNombre: 'CESFAM Centro',
    paciente: generarPaciente('11223344-5', 'Pedro', 'Ramírez', 'Castro', 32, 'M'),
    fecha: '2026-10-28', hora: '10:00', profesional: 'Enf. Contreras', prestacion: 'Curación', tipo: 'morbilidad',
    estadoConfirmacion: 'sin_enviar'
  },
  {
    id: 'ct4', centroId: 'c1', centroNombre: 'CESFAM Centro',
    paciente: generarPaciente('55667788-0', 'Rosa', 'Muñoz', 'Vega', 72, 'F'),
    fecha: '2026-10-28', hora: '10:30', profesional: 'Dra. Martínez', prestacion: 'Control HTA', tipo: 'cronico',
    estadoConfirmacion: 'enviado', fechaEnvio: '2026-10-27T14:30:00'
  },
  {
    id: 'ct5', centroId: 'c1', centroNombre: 'CESFAM Centro',
    paciente: generarPaciente('99887766-4', 'Luis', 'Fernández', 'Ortiz', 58, 'M'),
    fecha: '2026-10-28', hora: '11:00', profesional: 'Dr. Torres', prestacion: 'Control Crónico', tipo: 'cronico',
    estadoConfirmacion: 'confirmado', fechaEnvio: '2026-10-27T14:30:00', fechaRespuesta: '2026-10-27T15:12:00', formaContacto: 'whatsapp'
  },
  {
    id: 'ct6', centroId: 'c1', centroNombre: 'CESFAM Centro',
    paciente: generarPaciente('44556677-3', 'Ana', 'Soto', 'Herrera', 66, 'F'),
    fecha: '2026-10-28', hora: '11:30', profesional: 'Dra. Martínez', prestacion: 'Control DM2', tipo: 'cronico',
    estadoConfirmacion: 'sin_respuesta', fechaEnvio: '2026-10-27T14:30:00'
  },
];

export const llamadasEntrantesMock: LlamadaEntrante[] = [
  {
    id: 'll1', fecha: '2026-10-27', hora: '09:15', centroId: 'c1', centroNombre: 'CESFAM Centro',
    paciente: generarPaciente('11112222-3', 'José', 'Valdés', 'Molina', 54, 'M'),
    motivoId: 'm1', motivoDescripcion: 'Solicitud de hora', atendidoPor: 'Carolina Soto'
  },
  {
    id: 'll2', fecha: '2026-10-27', hora: '10:42', centroId: 'c2', centroNombre: 'CESFAM Norte',
    paciente: generarPaciente('33334444-5', 'Carmen', 'Araya', 'Fuentes', 61, 'F'),
    motivoId: 'm6', motivoDescripcion: 'Solicitud de certificado', atendidoPor: 'Daniela Rojas'
  },
];
