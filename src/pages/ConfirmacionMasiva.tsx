import { useState } from 'react';
import { Send, MessageCircle, CheckCircle, XCircle, Clock, Filter } from 'lucide-react';
import { citasMock } from '../data/mockData';
import './ConfirmacionMasiva.css';

const ConfirmacionMasiva = () => {
  const [citas, setCitas] = useState(citasMock);
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'cronico' | 'morbilidad'>('cronico');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const citasFiltradas = citas.filter(c => 
    (filtroTipo === 'todos' || c.tipo === filtroTipo) && 
    c.estadoConfirmacion === 'sin_enviar'
  );

  const toggleSeleccion = (id: string) => {
    setSeleccionadas(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const seleccionarTodas = () => {
    if (seleccionadas.length === citasFiltradas.length) {
      setSeleccionadas([]);
    } else {
      setSeleccionadas(citasFiltradas.map(c => c.id));
    }
  };

  const enviarMasivo = () => {
    setEnviando(true);
    setTimeout(() => {
      setCitas(prev => prev.map(c => 
        seleccionadas.includes(c.id) 
          ? { ...c, estadoConfirmacion: 'enviado', fechaEnvio: new Date().toISOString() }
          : c
      ));
      setEnviando(false);
      setEnviado(true);
      setSeleccionadas([]);
      setTimeout(() => setEnviado(false), 3000);
    }, 1500);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Confirmación Masiva por WhatsApp</h1>
        <p>Enviar confirmación de hora con respuesta Sí/No</p>
      </div>

      <div className="card">
        <div className="card-header card-header-between">
          <h2><Send size={18} /> Envío Masivo</h2>
          <div className="header-actions">
            <div className="filter-group">
              <Filter size={16} />
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as any)}>
                <option value="cronico">Solo Crónicos</option>
                <option value="morbilidad">Solo Morbilidad</option>
                <option value="todos">Todos</option>
              </select>
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="whatsapp-preview">
            <MessageCircle size={20} />
            <div>
              <strong>Mensaje a enviar:</strong>
              <p>"Mañana tiene hora con [Profesional], [Prestación], [Hora]. ¿Va a asistir? Sí / No"</p>
            </div>
          </div>

          {enviado && (
            <div className="alert alert-success">
              <CheckCircle size={18} />
              <span>Mensajes enviados exitosamente ({seleccionadas.length} citas)</span>
            </div>
          )}

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>
                    <input 
                      type="checkbox" 
                      checked={seleccionadas.length === citasFiltradas.length && citasFiltradas.length > 0}
                      onChange={seleccionarTodas}
                    />
                  </th>
                  <th>Paciente</th>
                  <th>Fecha/Hora</th>
                  <th>Profesional</th>
                  <th>Prestación</th>
                  <th>Tipo</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {citasFiltradas.map((cita) => (
                  <tr key={cita.id}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={seleccionadas.includes(cita.id)}
                        onChange={() => toggleSeleccion(cita.id)}
                      />
                    </td>
                    <td>
                      <div className="patient-cell">
                        <div className="patient-name">{cita.paciente.nombre} {cita.paciente.apellidoPaterno}</div>
                        <div className="patient-rut">{cita.paciente.rut}</div>
                      </div>
                    </td>
                    <td>{cita.fecha} {cita.hora}</td>
                    <td>{cita.profesional}</td>
                    <td>{cita.prestacion}</td>
                    <td>
                      <span className={`badge ${cita.tipo === 'cronico' ? 'badge-info' : 'badge-warning'}`}>
                        {cita.tipo === 'cronico' ? 'Crónico' : 'Morbilidad'}
                      </span>
                    </td>
                    <td>{cita.paciente.telefono}</td>
                    <td>
                      <span className="badge badge-warning">Sin enviar</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="action-bar">
            <span>{seleccionadas.length} seleccionadas</span>
            <button 
              className="btn btn-primary" 
              onClick={enviarMasivo}
              disabled={seleccionadas.length === 0 || enviando}
            >
              <Send size={18} />
              {enviando ? 'Enviando...' : 'Enviar por WhatsApp'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Estado de Confirmaciones</h2>
        </div>
        <div className="card-body">
          <div className="status-grid">
            <div className="status-item">
              <Clock size={20} className="status-icon warning" />
              <div>
                <div className="status-count">{citas.filter(c => c.estadoConfirmacion === 'sin_enviar').length}</div>
                <div className="status-label">Sin enviar</div>
              </div>
            </div>
            <div className="status-item">
              <Send size={20} className="status-icon info" />
              <div>
                <div className="status-count">{citas.filter(c => c.estadoConfirmacion === 'enviado').length}</div>
                <div className="status-label">Enviados (esperando respuesta)</div>
              </div>
            </div>
            <div className="status-item">
              <CheckCircle size={20} className="status-icon success" />
              <div>
                <div className="status-count">{citas.filter(c => c.estadoConfirmacion === 'confirmado').length}</div>
                <div className="status-label">Confirmados</div>
              </div>
            </div>
            <div className="status-item">
              <XCircle size={20} className="status-icon danger" />
              <div>
                <div className="status-count">{citas.filter(c => c.estadoConfirmacion === 'cancelado').length}</div>
                <div className="status-label">Cancelados</div>
              </div>
            </div>
            <div className="status-item">
              <Clock size={20} className="status-icon orange" />
              <div>
                <div className="status-count">{citas.filter(c => c.estadoConfirmacion === 'sin_respuesta').length}</div>
                <div className="status-label">Sin respuesta</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmacionMasiva;
