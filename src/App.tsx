import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import Layout from './components/Layout';
import DemoBanner from './components/DemoBanner';
import Dashboard from './pages/Dashboard';
import CargaCitas from './pages/CargaCitas';
import ConfirmacionMasiva from './pages/ConfirmacionMasiva';
import PendientesLlamar from './pages/PendientesLlamar';
import LlamadaEntrante from './pages/LlamadaEntrante';
import HistorialLlamadas from './pages/HistorialLlamadas';
import Reportes from './pages/Reportes';
import Configuracion from './pages/Configuracion';
import Login from './pages/Login';

function ProtectedRoute({ children, path }: { children: React.ReactNode; path: string }) {
  const { canAccess } = useAuth();
  if (!canAccess(path)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { ready, session } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="login-container" style={{ minHeight: '100vh' }}>
        <DemoBanner />
        <p style={{ color: 'white', marginTop: 48 }}>Cargando demo…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <DemoBanner />
        <Login />
      </>
    );
  }

  return (
    <Routes location={location}>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route
          path="carga-citas"
          element={
            <ProtectedRoute path="/carga-citas">
              <CargaCitas />
            </ProtectedRoute>
          }
        />
        <Route
          path="confirmacion-masiva"
          element={
            <ProtectedRoute path="/confirmacion-masiva">
              <ConfirmacionMasiva />
            </ProtectedRoute>
          }
        />
        <Route
          path="pendientes"
          element={
            <ProtectedRoute path="/pendientes">
              <PendientesLlamar />
            </ProtectedRoute>
          }
        />
        <Route
          path="llamada-entrante"
          element={
            <ProtectedRoute path="/llamada-entrante">
              <LlamadaEntrante />
            </ProtectedRoute>
          }
        />
        <Route
          path="historial"
          element={
            <ProtectedRoute path="/historial">
              <HistorialLlamadas />
            </ProtectedRoute>
          }
        />
        <Route
          path="reportes"
          element={
            <ProtectedRoute path="/reportes">
              <Reportes />
            </ProtectedRoute>
          }
        />
        <Route
          path="configuracion"
          element={
            <ProtectedRoute path="/configuracion">
              <Configuracion />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <AppRoutes />
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
