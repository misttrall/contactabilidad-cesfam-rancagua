/**
 * Datos SEMILLA claramente ficticios (RNF-01). Los RUT son válidos por módulo 11 pero
 * pertenecen a una serie de prueba (1.000.00X); los teléfonos usan 9 0000 00XX.
 * NO usar datos reales de pacientes en ningún ambiente que no sea el piloto autorizado.
 */
export const CENTROS_SEMILLA = [
  { codigo: 'CSC', nombre: 'CESFAM Centro (DEMO)' },
  { codigo: 'CSN', nombre: 'CESFAM Norte (DEMO)' },
  { codigo: 'CSS', nombre: 'CESFAM Sur (DEMO)' },
] as const;

export const MOTIVOS_SEMILLA = [
  { codigo: 'SOL_HORA', descripcion: 'Solicitud de hora' },
  { codigo: 'CONS_RESULT', descripcion: 'Consulta de resultados' },
  { codigo: 'REAG_CITA', descripcion: 'Reagendamiento / cambio de hora' },
  { codigo: 'CAMBIO_DOM', descripcion: 'Cambio de datos / domicilio' },
  { codigo: 'FARMACIA', descripcion: 'Consulta de farmacia' },
  { codigo: 'CERTIFICADO', descripcion: 'Solicitud de certificado' },
  { codigo: 'OTROS', descripcion: 'Otros' },
] as const;

export const PACIENTES_SEMILLA = [
  { rut: '1000001-7', nombre: 'Paciente Demo 001', edad: 68, sexo: 'M', telefono: '+56900000001' },
  { rut: '1000002-5', nombre: 'Paciente Demo 002', edad: 45, sexo: 'F', telefono: '+56900000002' },
  { rut: '1000003-3', nombre: 'Paciente Demo 003', edad: 72, sexo: 'F', telefono: '+56900000003' },
] as const;
