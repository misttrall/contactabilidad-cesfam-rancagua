import { Heart } from 'lucide-react';
import './Login.css';

const Login = () => {
  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <Heart size={40} className="login-logo" />
          <h1>BusinessHub</h1>
          <p>Sistema de Contactabilidad - CESFAM Rancagua</p>
        </div>
        <form className="login-form">
          <div className="form-group">
            <label>Usuario</label>
            <input type="text" placeholder="Ingrese su usuario" defaultValue="csoto" />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <input type="password" placeholder="Ingrese su contraseña" defaultValue="demo" />
          </div>
          <button type="submit" className="login-btn">Iniciar Sesión</button>
        </form>
        <div className="login-footer">
          <small>Mockup funcional - Datos ficticios</small>
        </div>
      </div>
    </div>
  );
};

export default Login;
