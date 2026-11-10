import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { Mensaje } from './paginas/Mensaje';
import { Portada } from './paginas/Portada';
import { crearRouter } from './router';

function ConSesion() {
  const [router] = useState(() => crearRouter());
  return <RouterProvider router={router} />;
}

function Puerta() {
  const { estado } = useAuth();
  if (estado === 'cargando') return <Mensaje titulo="Cargando…" />;
  if (estado === 'autenticado') return <ConSesion />;
  return <Portada />;
}

export function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Puerta />
      </AuthProvider>
    </QueryClientProvider>
  );
}
