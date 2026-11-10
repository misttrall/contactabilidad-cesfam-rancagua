import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@bh/ui/tokens.css';
import '@bh/ui/componentes.css';
import './app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
