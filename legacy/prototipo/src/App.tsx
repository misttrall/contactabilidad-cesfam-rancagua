import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CargaCitas from './pages/CargaCitas';
import ConfirmacionMasiva from './pages/ConfirmacionMasiva';
import PendientesLlamar from './pages/PendientesLlamar';
import LlamadaEntrante from './pages/LlamadaEntrante';
import HistorialLlamadas from './pages/HistorialLlamadas';
import Reportes from './pages/Reportes';
import Configuracion from './pages/Configuracion';
import Login from './pages/Login';

function App() {
  const isAuthenticated = true;

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="carga-citas" element={<CargaCitas />} />
          <Route path="confirmacion-masiva" element={<ConfirmacionMasiva />} />
          <Route path="pendientes" element={<PendientesLlamar />} />
          <Route path="llamada-entrante" element={<LlamadaEntrante />} />
          <Route path="historial" element={<HistorialLlamadas />} />
          <Route path="reportes" element={<Reportes />} />
          <Route path="configuracion" element={<Configuracion />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
