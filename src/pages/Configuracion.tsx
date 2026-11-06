import { useState } from 'react';
import { Settings, MessageCircle, Users, Building2, RotateCcw } from 'lucide-react';
import { centros, usuarios } from '../data/mockData';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import './Configuracion.css';

const Configuracion = () => {
  const { resetDemo } = useData();
  const { canAccess } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);

  if (!canAccess('/configuracion')) {
    return (
      <div className="page">
        <div className="alert alert-danger">No tienes permiso para ver esta sección.</div>
      </div>
    );
  }

  const handleReset = async () => {
    if (!confirm('¿Restablecer todos los datos demo a la semilla inicial?')) return;
    await resetDemo();
    setMsg('Datos demo restablecidos.');
    setTimeout(() => setMsg(null), 2500);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Configuración</h1>
        <p>Administración de la demo (solo administrador)</p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2>
              <MessageCircle size={18} /> Configuración WhatsApp
            </h2>
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
              <textarea rows={2} placeholder="Mensaje para reenvío si no responde..." />
            </div>
            <div className="checkbox-group">
              <label>
                <input type="checkbox" />
                <span>Enviar segundo mensaje a adultos mayores sin respuesta</span>
              </label>
            </div>
            <div className="cost-info">
              <strong>Nota:</strong> En esta demo el envío es simulado. Roadmap: WhatsApp Cloud API en
              sandbox.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>
              <Building2 size={18} /> Centros CESFAM (demo)
            </h2>
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
                    <td>
                      <span className="badge badge-success">Activo</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>
            <Users size={18} /> Usuarios y Roles
          </h2>
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
                    <span
                      className={`badge ${
                        usuario.rol === 'administrador'
                          ? 'badge-danger'
                          : usuario.rol === 'encargado'
                            ? 'badge-warning'
                            : 'badge-info'
                      }`}
                    >
                      {usuario.rol === 'administrador'
                        ? 'Administrador'
                        : usuario.rol === 'encargado'
                          ? 'Encargado'
                          : 'Funcionaria'}
                    </span>
                  </td>
                  <td>
                    {usuario.centroId
                      ? centros.find((c) => c.id === usuario.centroId)?.nombre
                      : 'Todos'}
                  </td>
                  <td>
                    <span className="badge badge-success">Activo</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>
            <Settings size={18} /> Datos de la demo
          </h2>
        </div>
        <div className="card-body">
          <p style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: 14 }}>
            Restablece citas y llamadas a la semilla ficticia inicial (borra lo cargado desde Excel
            y las respuestas simuladas).
          </p>
          <button className="btn btn-danger" onClick={() => void handleReset()}>
            <RotateCcw size={18} />
            Restablecer datos demo
          </button>
        </div>
      </div>
    </div>
  );
};

export default Configuracion;
