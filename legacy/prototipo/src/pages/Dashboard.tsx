import { Calendar, PhoneCall, PhoneIncoming, CheckCircle, XCircle, Clock } from 'lucide-react';
import { citasMock, llamadasEntrantesMock } from '../data/mockData';
import './Dashboard.css';

const Dashboard = () => {
  const stats = [
    { label: 'Citas cargadas hoy', value: citasMock.length, icon: Calendar, color: '#0066cc' },
    { label: 'Por confirmar (WhatsApp)', value: citasMock.filter(c => c.estadoConfirmacion === 'sin_enviar').length, icon: PhoneCall, color: '#ffc107' },
    { label: 'Confirmadas', value: citasMock.filter(c => c.estadoConfirmacion === 'confirmado').length, icon: CheckCircle, color: '#28a745' },
    { label: 'Sin respuesta', value: citasMock.filter(c => c.estadoConfirmacion === 'sin_respuesta').length, icon: Clock, color: '#fd7e14' },
    { label: 'Canceladas', value: citasMock.filter(c => c.estadoConfirmacion === 'cancelado').length, icon: XCircle, color: '#dc3545' },
    { label: 'Llamadas entrantes hoy', value: llamadasEntrantesMock.length, icon: PhoneIncoming, color: '#17a2b8' },
  ];

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Resumen de contactabilidad - CESFAM Centro</p>
      </div>

      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>
              <stat.icon size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h2>Próximas citas a confirmar</h2>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Fecha/Hora</th>
                  <th>Prestación</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {citasMock.slice(0, 5).map((cita) => (
                  <tr key={cita.id}>
                    <td>
                      <div className="patient-cell">
                        <div className="patient-name">{cita.paciente.nombre} {cita.paciente.apellidoPaterno}</div>
                        <div className="patient-rut">{cita.paciente.rut}</div>
                      </div>
                    </td>
                    <td>{cita.fecha} {cita.hora}</td>
                    <td>{cita.prestacion}</td>
                    <td>
                      <span className={`badge ${cita.tipo === 'cronico' ? 'badge-info' : 'badge-warning'}`}>
                        {cita.tipo === 'cronico' ? 'Crónico' : 'Morbilidad'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${cita.estadoConfirmacion === 'sin_enviar' ? 'warning' : cita.estadoConfirmacion === 'confirmado' ? 'success' : cita.estadoConfirmacion === 'sin_respuesta' ? 'orange' : 'danger'}`}>
                        {cita.estadoConfirmacion === 'sin_enviar' ? 'Sin enviar' : cita.estadoConfirmacion === 'confirmado' ? 'Confirmado' : cita.estadoConfirmacion === 'sin_respuesta' ? 'Sin respuesta' : 'Cancelado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Llamadas Entrantes Recientes</h2>
          </div>
          <div className="list">
            {llamadasEntrantesMock.map((llamada) => (
              <div key={llamada.id} className="list-item">
                <div className="list-item-icon">
                  <PhoneIncoming size={18} />
                </div>
                <div className="list-item-content">
                  <div className="list-item-title">
                    {llamada.paciente.nombre} {llamada.paciente.apellidoPaterno}
                  </div>
                  <div className="list-item-subtitle">
                    {llamada.motivoDescripcion} - {llamada.hora}
                  </div>
                </div>
                <div className="list-item-meta">
                  {llamada.centroNombre}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
