import { Settings, MessageCircle, Users, Building2 } from 'lucide-react';
import { centros, usuarios } from '../data/mockData';
import './Configuracion.css';

const Configuracion = () => {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Configuración</h1>
        <p>Administración del sistema</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2><MessageCircle size={18} /> Configuración WhatsApp</h2>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>Plantilla de Mensaje</label>
              <textarea 
                rows={3}
                defaultValue="Mañana tiene hora con [profesional], [prestación], [hora]. ¿Va a asistir? Sí / No"
              />
            </div>
            <div className="form-group">
              <label>Segundo mensaje (opcional)</label>
              <textarea 
                rows={2}
                placeholder="Mensaje para reenvío si no responde..."
              />
            </div>
            <div className="checkbox-group">
              <label>
                <input type="checkbox" />
                <span>Enviar segundo mensaje a adultos mayores sin respuesta</span>
              </label>
            </div>
            <div className="cost-info">
              <strong>Costo estimado:</strong> WhatsApp Business API - Requiere cotización
            </div>
            <button className="btn btn-primary">Guardar Configuración</button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2><Building2 size={18} /> Centros CESFAM</h2>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {centros.map((centro) => (
                  <tr key={centro.id}>
                    <td>{centro.codigo}</td>
                    <td>{centro.nombre}</td>
                    <td><span className="badge badge-success">Activo</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2><Users size={18} /> Usuarios y Roles</h2>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Apellido</th>
                <th>Rol</th>
                <th>Centro</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td>{usuario.nombre}</td>
                  <td>{usuario.apellido}</td>
                  <td>
                    <span className={`badge ${usuario.rol === 'administrador' ? 'badge-danger' : usuario.rol === 'encargado' ? 'badge-warning' : 'badge-info'}`}>
                      {usuario.rol === 'administrador' ? 'Administrador' : usuario.rol === 'encargado' ? 'Encargado' : 'Funcionaria'}
                    </span>
                  </td>
                  <td>{usuario.centroId ? centros.find(c => c.id === usuario.centroId)?.nombre : 'Todos'}</td>
                  <td><span className="badge badge-success">Activo</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2><Settings size={18} /> Configuración General</h2>
        </div>
        <div className="card-body">
          <div className="config-grid">
            <div className="config-item">
              <strong>Excluir morbilidad por defecto</strong>
              <p>Solo confirmar controles crónicos</p>
              <label className="toggle">
                <input type="checkbox" defaultChecked />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="config-item">
              <strong>Sin respuesta no cancela cita</strong>
              <p>Siempre mantener cita activa</p>
              <label className="toggle">
                <input type="checkbox" defaultChecked disabled />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="config-item">
              <strong>Precarga paciente por RUT</strong>
              <p>En llamadas entrantes</p>
              <label className="toggle">
                <input type="checkbox" defaultChecked />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Configuracion;
