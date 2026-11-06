import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import DemoBanner from './DemoBanner';
import './Layout.css';

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="layout-root">
      <DemoBanner />
      <div className="layout">
        <Sidebar open={sidebarOpen} />
        <div className={`layout-main ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
          <Header toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <main className="layout-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
