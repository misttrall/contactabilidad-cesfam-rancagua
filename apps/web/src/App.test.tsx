import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

afterEach(cleanup);

describe('App (S0)', () => {
  it('muestra el aviso de datos ficticios fuera de producción', () => {
    render(<App />);
    expect(screen.getByRole('status').textContent).toContain('Datos ficticios');
  });
  it('lista los cinco estados de la cita con texto', () => {
    render(<App />);
    for (const t of ['Sin enviar', 'Confirmado', 'Cancelado por paciente']) {
      expect(screen.getAllByText(new RegExp(t)).length).toBeGreaterThan(0);
    }
  });
});
