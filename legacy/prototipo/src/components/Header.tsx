import { Menu, Bell, User } from 'lucide-react';
import './Header.css';

interface HeaderProps {
  toggleSidebar: () => void;
}

const Header = ({ toggleSidebar }: HeaderProps) => {
  return (
    <header className="header">
      <div className="header-left">
        <button className="menu-btn" onClick={toggleSidebar}>
          <Menu size={20} />
        </button>
        <div className="header-title">
          <h2>Sistema de Contactabilidad</h2>
          <p>CESFAM Rancagua</p>
        </div>
      </div>
      <div className="header-right">
        <button className="header-icon-btn">
          <Bell size={20} />
        </button>
        <div className="header-user">
          <div className="user-avatar">
            <User size={18} />
          </div>
          <div className="user-info">
            <span className="user-name">Carolina Soto</span>
            <span className="user-role">Funcionaria - CESFAM Centro</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
