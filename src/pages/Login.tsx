import { Hexagon } from 'lucide-react';
import { usuarios } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const rolLabel = (rol: string) => {
  if (rol === 'administrador') return 'Administrador';
  if (rol === 'encargado') return 'Encargado';
  return 'Funcionaria';
};

const Login = () => {
  const { loginAs } = useAuth();

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <Hexagon size={40} className="login-logo" />
          <h1>Fluxor</h1>
          <p>Demo de contactabilidad · Datos ficticios</p>
        </div>

        <div className="login-roles">
          <p className="login-roles-title">Elige un rol de demostración</p>
          {usuarios.filter((u) => u.activo).map((u) => (
            <button
              key={u.id}
              type="button"
              className="role-btn"
              onClick={() => void loginAs(u.id)}
            >
              <span className="role-btn-name">
                {u.nombre} {u.apellido}
              </span>
              <span className="role-btn-meta">{rolLabel(u.rol)}</span>
            </button>
          ))}
        </div>

        <div className="login-footer">
          <small>
            Proyecto conceptual de Fluxor SpA. No es un sistema oficial del CESFAM.
            No uses datos reales de pacientes (Ley 19.628 / 20.584).
          </small>
        </div>
      </div>
    </div>
  );
};

export default Login;
