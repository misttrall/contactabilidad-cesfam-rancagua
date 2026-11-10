import { FileText, Calendar, User, Phone } from 'lucide-react';
import { llamadasEntrantesMock } from '../data/mockData';
import './HistorialLlamadas.css';

const HistorialLlamadas = () => {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Historial de Llamadas Entrantes</h1>
        <p>Registro completo de llamadas atendidas</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2><FileText size={18} /> Historial</h2>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Fecha/Hora</th>
                <th>Centro</th>
                <th>Paciente</th>
                <th>RUT</th>
                <th>Edad/Sexo</th>
                <th>Teléfono</th>
                <th>Motivo</th>
                <th>Atendido Por</th>
              </tr>
            </thead>
            <tbody>
              {llamadasEntrantesMock.map((llamada) => (
                <tr key={llamada.id}>
                  <td>
                    <div className="fecha-cell">
                      <Calendar size={14} />
                      {llamada.fecha} {llamada.hora}
                    </div>
                  </td>
                  <td>{llamada.centroNombre}</td>
                  <td>
                    <div className="patient-cell">
                      <div className="patient-name">{llamada.paciente.nombre} {llamada.paciente.apellidoPaterno}</div>
                    </div>
                  </td>
                  <td>{llamada.paciente.rut}</td>
                  <td>{llamada.paciente.edad} / {llamada.paciente.sexo}</td>
                  <td>
                    <div className="telefono-cell">
                      <Phone size={14} />
                      {llamada.paciente.telefono}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-info">{llamada.motivoDescripcion}</span>
                  </td>
                  <td>
                    <div className="atendido-cell">
                      <User size={14} />
                      {llamada.atendidoPor}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HistorialLlamadas;
