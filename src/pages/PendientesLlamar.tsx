import { useState } from 'react';
import { PhoneCall, User, Calendar, AlertCircle, CheckCircle, XCircle, PhoneOff } from 'lucide-react';
import { citasMock } from '../data/mockData';
import './PendientesLlamar.css';

const PendientesLlamar = () => {
  const [citas, setCitas] = useState(citasMock.filter(c => 
    c.estadoConfirmacion === 'sin_respuesta' || c.estadoConfirmacion === 'enviado'
  ));
  const [citaSeleccionada, setCitaSeleccionada] = useState<any>(null);
  const [resultado, setResultado] = useState('');

  const marcarResultado = (estado: string) => {
    if (!citaSeleccionada) return;
    
    setCitas(prev => prev.map(c => 
      c.id === citaSeleccionada.id 
        ? { ...c, estadoConfirmacion: estado, fechaLlamado: new Date().toISOString(), atendidoPor: 'Carolina Soto' }
        : c
    ));
    setCitaSeleccionada(null);
    setResultado('');
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Pendientes por Llamar</h1>
        <p>Sin respuesta o enviados sin confirmar - Llamar y registrar resultado</p>
      </div>

      <div className="alert alert-warning">
        <AlertCircle size={18} />
        <span><strong>Importante:</strong> Sin respuesta NUNCA cancela la cita. Solo se registra el resultado.</span>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2><PhoneCall size={18} /> Lista de Pendientes</h2>
          </div>
          <div className="list-pendientes">
            {citas.length === 0 ? (
              <div className="empty-state">
                <CheckCircle size={48} />
                <p>No hay pendientes por llamar</p>
              </div>
            ) : (
              citas.map((cita) => (
                <div 
                  key={cita.id} 
                  className={`pendiente-item ${citaSeleccionada?.id === cita.id ? 'selected' : ''}`}
                  onClick={() => setCitaSeleccionada(cita)}
                >
                  <div className="pendiente-header">
                    <div className="patient-info">
                      <strong>{cita.paciente.nombre} {cita.paciente.apellidoPaterno} {cita.paciente.apellidoMaterno}</strong>
                      <span className="rut">{cita.paciente.rut}</span>
                    </div>
                    <span className={`badge ${cita.paciente.edad >= 65 ? 'badge-warning' : 'badge-info'}`}>
                      {cita.paciente.edad >= 65 ? 'Adulto Mayor' : 'Menor de 65'}
                    </span>
                  </div>
                  <div className="pendiente-details">
                    <div><Calendar size={14} /> {cita.fecha} {cita.hora}</div>
                    <div><User size={14} /> {cita.profesional} - {cita.prestacion}</div>
                    <div>📞 {cita.paciente.telefono}</div>
                  </div>
                  <div className="pendiente-status">
                    <span className={`badge badge-${cita.estadoConfirmacion === 'sin_respuesta' ? 'orange' : 'info'}`}>
                      {cita.estadoConfirmacion === 'sin_respuesta' ? 'Sin respuesta' : 'Enviado sin confirmar'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2><PhoneCall size={18} /> Registrar Llamada</h2>
          </div>
          <div className="card-body">
            {!citaSeleccionada ? (
              <div className="empty-state">
                <PhoneCall size={48} />
                <p>Seleccione un paciente de la lista para llamar</p>
              </div>
            ) : (
              <>
                <div className="paciente-detalle">
                  <h3>{citaSeleccionada.paciente.nombre} {citaSeleccionada.paciente.apellidoPaterno}</h3>
                  <div className="detalle-grid">
                    <div><strong>RUT:</strong> {citaSeleccionada.paciente.rut}</div>
                    <div><strong>Edad:</strong> {citaSeleccionada.paciente.edad} años</div>
                    <div><strong>Sexo:</strong> {citaSeleccionada.paciente.sexo === 'M' ? 'Masculino' : 'Femenino'}</div>
                    <div><strong>Teléfono:</strong> {citaSeleccionada.paciente.telefono}</div>
                    <div><strong>Fecha/Hora:</strong> {citaSeleccionada.fecha} {citaSeleccionada.hora}</div>
                    <div><strong>Profesional:</strong> {citaSeleccionada.profesional}</div>
                    <div><strong>Prestación:</strong> {citaSeleccionada.prestacion}</div>
                    <div><strong>Centro:</strong> {citaSeleccionada.centroNombre}</div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Resultado de la Llamada</label>
                  <select value={resultado} onChange={(e) => setResultado(e.target.value)}>
                    <option value="">Seleccione resultado...</option>
                    <option value="confirmado">Confirmado (Asistirá)</option>
                    <option value="recado">Recado (Dejó recado)</option>
                    <option value="no_ubicado">No ubicado</option>
                    <option value="cancelado">Cancelado (Paciente indica que NO asistirá)</option>
                  </select>
                </div>

                <div className="resultado-botones">
                  <button 
                    className="btn-resultado btn-confirmado"
                    onClick={() => marcarResultado('confirmado')}
                    disabled={!resultado || resultado !== 'confirmado'}
                  >
                    <CheckCircle size={18} />
                    Confirmado
                  </button>
                  <button 
                    className="btn-resultado btn-recado"
                    onClick={() => marcarResultado('sin_respuesta')}
                    disabled={!resultado || resultado !== 'recado'}
                  >
                    <PhoneCall size={18} />
                    Recado
                  </button>
                  <button 
                    className="btn-resultado btn-no-ubicado"
                    onClick={() => marcarResultado('sin_respuesta')}
                    disabled={!resultado || resultado !== 'no_ubicado'}
                  >
                    <PhoneOff size={18} />
                    No Ubicado
                  </button>
                  <button 
                    className="btn-resultado btn-cancelado"
                    onClick={() => marcarResultado('cancelado')}
                    disabled={!resultado || resultado !== 'cancelado'}
                  >
                    <XCircle size={18} />
                    Cancelado
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PendientesLlamar;
