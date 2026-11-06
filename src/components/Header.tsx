import { Menu, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Header.css';

interface HeaderProps {
  toggleSidebar: () => void;
}

const rolLabel = (rol: string) => {
  if (rol === 'administrador') return 'Administrador';
  if (rol === 'encargado') return 'Encargado';
  return 'Funcionaria';
};

const Header = ({ toggleSidebar }: HeaderProps) => {
  const { session, logout } = useAuth();

  return (
    <header className="header">
      <div className="header-left">
        <button className="menu-btn" onClick={toggleSidebar} aria-label="Menú">
          <Menu size={20} />
        </button>
        <div className="header-title">
          <h2>Sistema de Contactabilidad</h2>
          <p>Demo conceptual · Fluxor SpA</p>
        </div>
      </div>
      <div className="header-right">
        <div className="header-user">
          <div className="user-avatar">
            <User size={18} />
          </div>
          <div className="user-info">
            <span className="user-name">
              {session ? `${session.nombre} ${session.apellido}` : 'Demo'}
            </span>
            <span className="user-role">{session ? rolLabel(session.rol) : ''}</span>
          </div>
        </div>
        <button className="header-icon-btn" onClick={() => void logout()} title="Cerrar sesión">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};

export default Header;
