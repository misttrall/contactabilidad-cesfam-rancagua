import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Upload, 
  Send, 
  PhoneCall, 
  PhoneIncoming, 
  FileText, 
  BarChart3, 
  Settings,
  Heart
} from 'lucide-react';
import './Sidebar.css';

interface SidebarProps {
  open: boolean;
}

const Sidebar = ({ open }: SidebarProps) => {
  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/carga-citas', icon: Upload, label: 'Cargar Citas AVIS' },
    { path: '/confirmacion-masiva', icon: Send, label: 'Confirmación Masiva' },
    { path: '/pendientes', icon: PhoneCall, label: 'Pendientes por Llamar' },
    { path: '/llamada-entrante', icon: PhoneIncoming, label: 'Llamada Entrante' },
    { path: '/historial', icon: FileText, label: 'Historial Llamadas' },
    { path: '/reportes', icon: BarChart3, label: 'Reportes' },
    { path: '/configuracion', icon: Settings, label: 'Configuración' },
  ];

  return (
    <aside className={`sidebar ${open ? 'open' : 'closed'}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Heart size={24} />
          <span>BusinessHub</span>
        </div>
        <div className="sidebar-subtitle">Contactabilidad</div>
      </div>
      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            end={item.path === '/'}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
