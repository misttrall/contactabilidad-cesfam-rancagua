import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BannerAmbiente, EstadoCitaBadge, RutInput } from './index';

afterEach(cleanup);

describe('EstadoCitaBadge', () => {
  it('muestra texto (no solo color) para cada estado', () => {
    render(<EstadoCitaBadge estado="sin_respuesta" />);
    expect(screen.getByText('Sin respuesta · llamar')).toBeTruthy();
  });
  it('distingue recado y no ubicado dentro de sin respuesta, sin pasar a cancelado', () => {
    const { container } = render(<EstadoCitaBadge estado="sin_respuesta" subestado="recado" />);
    expect(screen.getByText('Recado dejado')).toBeTruthy();
    expect(container.querySelector('.bh-badge--sin_respuesta')).not.toBeNull();
    expect(container.querySelector('.bh-badge--cancelado')).toBeNull();
  });
});

describe('BannerAmbiente', () => {
  it('avisa datos ficticios en DEMO y no aparece en producción', () => {
    const { rerender, container } = render(<BannerAmbiente ambiente="DEMO" />);
    expect(screen.getByRole('status').textContent).toContain('Datos ficticios');
    rerender(<BannerAmbiente ambiente="PRODUCCION" />);
    expect(container.firstChild).toBeNull();
  });
});

describe('RutInput', () => {
  it('aplica máscara, valida y busca con Enter solo si el RUT es válido', () => {
    const onBuscar = vi.fn();
    render(<RutInput onBuscar={onBuscar} />);
    const input = screen.getByLabelText('RUT del paciente') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '10000019' } });
    expect(input.value).toBe('1.000.001-9');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onBuscar).not.toHaveBeenCalled();
    expect(screen.getByText(/RUT no válido/)).toBeTruthy();

    fireEvent.change(input, { target: { value: '10000017' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onBuscar).toHaveBeenCalledWith('1000001-7');
  });
});
