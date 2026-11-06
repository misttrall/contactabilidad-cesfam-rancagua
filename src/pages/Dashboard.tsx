import { Calendar, PhoneCall, PhoneIncoming, CheckCircle, XCircle, Clock, Send } from 'lucide-react';
import { useData } from '../context/DataContext';
import './Dashboard.css';

const estadoBadge = (estado: string) => {
  if (estado === 'sin_enviar') return { cls: 'badge-warning', label: 'Sin enviar' };
  if (estado === 'enviado') return { cls: 'badge-info', label: 'Enviado' };
  if (estado === 'confirmado') return { cls: 'badge-success', label: 'Confirmado' };
  if (estado === 'sin_respuesta') return { cls: 'badge-orange', label: 'Sin respuesta' };
  if (estado === 'cancelado') return { cls: 'badge-danger', label: 'Cancelado' };
  return { cls: 'badge-info', label: estado };
};

const Dashboard = () => {
  const { citas, llamadas, ready } = useData();

  if (!ready) return <div className="page">Cargando…</div>;

  const stats = [
    { label: 'Citas cargadas', value: citas.length, icon: Calendar, color: '#1E5BB8' },
    { label: 'Por confirmar (WhatsApp)', value: citas.filter((c) => c.estadoConfirmacion === 'sin_enviar').length, icon: PhoneCall, color: '#ffc107' },
    { label: 'Enviados', value: citas.filter((c) => c.estadoConfirmacion === 'enviado').length, icon: Send, color: '#17a2b8' },
    { label: 'Confirmadas', value: citas.filter((c) => c.estadoConfirmacion === 'confirmado').length, icon: CheckCircle, color: '#28a745' },
    { label: 'Sin respuesta', value: citas.filter((c) => c.estadoConfirmacion === 'sin_respuesta').length, icon: Clock, color: '#fd7e14' },
    { label: 'Canceladas', value: citas.filter((c) => c.estadoConfirmacion === 'cancelado').length, icon: XCircle, color: '#dc3545' },
    { label: 'Llamadas entrantes', value: llamadas.length, icon: PhoneIncoming, color: '#00C2B8' },
  ];

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Resumen calculado desde los datos de la demo (IndexedDB)</p>
      </div>

      <div className="stats-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
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
            <h2>Citas recientes</h2>
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
                {citas.slice(0, 8).map((cita) => {
                  const b = estadoBadge(cita.estadoConfirmacion);
                  return (
                    <tr key={cita.id}>
                      <td>
                        <div className="patient-cell">
                          <div className="patient-name">
                            {cita.paciente.nombre} {cita.paciente.apellidoPaterno}
                          </div>
                          <div className="patient-rut">{cita.paciente.rut}</div>
                        </div>
                      </td>
                      <td>
                        {cita.fecha} {cita.hora}
                      </td>
                      <td>{cita.prestacion}</td>
                      <td>
                        <span className={`badge ${cita.tipo === 'cronico' ? 'badge-info' : 'badge-warning'}`}>
                          {cita.tipo === 'cronico' ? 'Crónico' : 'Morbilidad'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${b.cls}`}>{b.label}</span>
                      </td>
                    </tr>
                  );
                })}
                {citas.length === 0 && (
                  <tr>
                    <td colSpan={5}>Sin citas. Carga la plantilla demo desde «Cargar Citas».</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Llamadas entrantes</h2>
          </div>
          <div className="list">
            {llamadas.slice(0, 6).map((llamada) => (
              <div key={llamada.id} className="list-item">
                <div className="list-item-icon">
                  <PhoneIncoming size={18} />
                </div>
                <div className="list-item-content">
                  <div className="list-item-title">
                    {llamada.paciente.nombre} {llamada.paciente.apellidoPaterno}
                  </div>
                  <div className="list-item-subtitle">
                    {llamada.motivoDescripcion} · {llamada.hora}
                  </div>
                </div>
                <div className="list-item-meta">{llamada.centroNombre}</div>
              </div>
            ))}
            {llamadas.length === 0 && <div className="empty-state">Sin llamadas registradas</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
