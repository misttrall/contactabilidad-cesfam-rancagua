/**
 * Catálogo estático y semillas de DEMO.
 * Todos los pacientes son ficticios (prefijo DEMO / RUT 00.000.00X-X).
 * No contiene datos reales de pacientes ni exportaciones AVIS.
 */
import { Centro, Cita, MotivoLlamada, LlamadaEntrante, Usuario, Paciente } from './types';

export const centros: Centro[] = [
  { id: 'c1', nombre: 'CESFAM Centro (demo)', codigo: 'CSC' },
  { id: 'c2', nombre: 'CESFAM Norte (demo)', codigo: 'CSN' },
  { id: 'c3', nombre: 'CESFAM Sur (demo)', codigo: 'CSS' },
  { id: 'c4', nombre: 'CESFAM Oriente (demo)', codigo: 'CSO' },
  { id: 'c5', nombre: 'CESFAM Poniente (demo)', codigo: 'CSP' },
  { id: 'c6', nombre: 'CESFAM La Rosa (demo)', codigo: 'CSLR' },
  { id: 'c7', nombre: 'CESFAM Cachapoal (demo)', codigo: 'CSCA' },
];

export const usuarios: Usuario[] = [
  { id: 'u1', nombre: 'Ada', apellido: 'Admin', rol: 'administrador', activo: true },
  { id: 'u2', nombre: 'Elena', apellido: 'Encargada', rol: 'encargado', activo: true },
  { id: 'u3', nombre: 'Fiona', apellido: 'Funcionaria', rol: 'funcionaria', centroId: 'c1', activo: true },
  { id: 'u4', nombre: 'Nora', apellido: 'Norte', rol: 'funcionaria', centroId: 'c2', activo: true },
  { id: 'u5', nombre: 'Sara', apellido: 'Sur', rol: 'funcionaria', centroId: 'c3', activo: true },
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

const paciente = (
  rut: string,
  nombre: string,
  apellidoP: string,
  apellidoM: string,
  edad: number,
  sexo: 'M' | 'F',
  telefono: string
): Paciente => ({
  rut,
  nombre,
  apellidoPaterno: apellidoP,
  apellidoMaterno: apellidoM,
  telefono,
  edad,
  sexo,
});

/** Semilla inicial de citas (claramente ficticias). */
export const citasSeed: Cita[] = [
  {
    id: 'ct1',
    centroId: 'c1',
    centroNombre: 'CESFAM Centro (demo)',
    paciente: paciente('00.000.001-9', 'Demo', 'Alfa', 'Uno', 68, 'M', '+56900000001'),
    fecha: '2026-11-12',
    hora: '09:00',
    profesional: 'Dra. Demo Norte',
    prestacion: 'Control Crónico',
    tipo: 'cronico',
    estadoConfirmacion: 'sin_enviar',
  },
  {
    id: 'ct2',
    centroId: 'c1',
    centroNombre: 'CESFAM Centro (demo)',
    paciente: paciente('00.000.002-7', 'Demo', 'Beta', 'Dos', 45, 'F', '+56900000002'),
    fecha: '2026-11-12',
    hora: '09:30',
    profesional: 'Dr. Demo Sur',
    prestacion: 'Control DM2',
    tipo: 'cronico',
    estadoConfirmacion: 'sin_enviar',
  },
  {
    id: 'ct3',
    centroId: 'c1',
    centroNombre: 'CESFAM Centro (demo)',
    paciente: paciente('00.000.003-5', 'Demo', 'Gamma', 'Tres', 32, 'M', '+56900000003'),
    fecha: '2026-11-12',
    hora: '10:00',
    profesional: 'Enf. Demo Este',
    prestacion: 'Curación',
    tipo: 'morbilidad',
    estadoConfirmacion: 'sin_enviar',
  },
  {
    id: 'ct4',
    centroId: 'c1',
    centroNombre: 'CESFAM Centro (demo)',
    paciente: paciente('00.000.004-3', 'Demo', 'Delta', 'Cuatro', 72, 'F', '+56900000004'),
    fecha: '2026-11-12',
    hora: '10:30',
    profesional: 'Dra. Demo Norte',
    prestacion: 'Control HTA',
    tipo: 'cronico',
    estadoConfirmacion: 'enviado',
    fechaEnvio: '2026-11-11T14:30:00',
  },
  {
    id: 'ct5',
    centroId: 'c1',
    centroNombre: 'CESFAM Centro (demo)',
    paciente: paciente('00.000.005-1', 'Demo', 'Epsilon', 'Cinco', 58, 'M', '+56900000005'),
    fecha: '2026-11-12',
    hora: '11:00',
    profesional: 'Dr. Demo Sur',
    prestacion: 'Control Crónico',
    tipo: 'cronico',
    estadoConfirmacion: 'confirmado',
    fechaEnvio: '2026-11-11T14:30:00',
    fechaRespuesta: '2026-11-11T15:12:00',
    formaContacto: 'whatsapp',
  },
  {
    id: 'ct6',
    centroId: 'c1',
    centroNombre: 'CESFAM Centro (demo)',
    paciente: paciente('00.000.006-K', 'Demo', 'Zeta', 'Seis', 66, 'F', '+56900000006'),
    fecha: '2026-11-12',
    hora: '11:30',
    profesional: 'Dra. Demo Norte',
    prestacion: 'Control DM2',
    tipo: 'cronico',
    estadoConfirmacion: 'sin_respuesta',
    fechaEnvio: '2026-11-11T14:30:00',
  },
  {
    id: 'ct7',
    centroId: 'c2',
    centroNombre: 'CESFAM Norte (demo)',
    paciente: paciente('00.000.007-8', 'Demo', 'Eta', 'Siete', 55, 'F', '+56900000007'),
    fecha: '2026-11-13',
    hora: '08:30',
    profesional: 'Dr. Demo Oeste',
    prestacion: 'Control Crónico',
    tipo: 'cronico',
    estadoConfirmacion: 'sin_respuesta',
    fechaEnvio: '2026-11-11T16:00:00',
  },
  {
    id: 'ct8',
    centroId: 'c2',
    centroNombre: 'CESFAM Norte (demo)',
    paciente: paciente('00.000.008-6', 'Demo', 'Theta', 'Ocho', 41, 'M', '+56900000008'),
    fecha: '2026-11-13',
    hora: '09:00',
    profesional: 'Dra. Demo Norte',
    prestacion: 'Control HTA',
    tipo: 'cronico',
    estadoConfirmacion: 'enviado',
    fechaEnvio: '2026-11-11T16:00:00',
  },
];

export const llamadasSeed: LlamadaEntrante[] = [
  {
    id: 'll1',
    fecha: '2026-11-11',
    hora: '09:15',
    centroId: 'c1',
    centroNombre: 'CESFAM Centro (demo)',
    paciente: paciente('00.000.101-1', 'Demo', 'Iota', 'Nueve', 54, 'M', '+56900000101'),
    motivoId: 'm1',
    motivoDescripcion: 'Solicitud de hora',
    atendidoPor: 'Fiona Funcionaria',
  },
  {
    id: 'll2',
    fecha: '2026-11-11',
    hora: '10:42',
    centroId: 'c2',
    centroNombre: 'CESFAM Norte (demo)',
    paciente: paciente('00.000.102-K', 'Demo', 'Kappa', 'Diez', 61, 'F', '+56900000102'),
    motivoId: 'm6',
    motivoDescripcion: 'Solicitud de certificado',
    atendidoPor: 'Nora Norte',
  },
];

/** Compatibilidad con imports previos */
export const citasMock = citasSeed;
export const llamadasEntrantesMock = llamadasSeed;
