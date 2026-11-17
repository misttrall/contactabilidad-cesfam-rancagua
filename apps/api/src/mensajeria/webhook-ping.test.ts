import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../config';
import { WebhookService, type PayloadWebhook } from './webhook.service';

const EQUIPO = '+56912345678';

function montar(ambiente: Config['ambiente'], demoTelefonos: string[], falla = false) {
  const enviarTexto = vi.fn(async () => {
    if (falla) throw new Error('canal caído');
    return { proveedorId: 'wamid.pong' };
  });
  const respuestas = { confirmar: vi.fn(), cancelar: vi.fn(), registrarBaja: vi.fn() };
  const prisma = {
    mensajeEntrante: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    tareaContacto: { findMany: vi.fn(async () => []) },
  };
  const servicio = new WebhookService(
    prisma as never,
    { hashesBusqueda: () => ['hash'] } as never,
    respuestas as never,
    { ahora: () => new Date() },
    { ambiente, demoTelefonos } as Config,
    { enviarTexto, enviarPlantilla: vi.fn() },
  );
  return { servicio, enviarTexto, respuestas, prisma };
}

const texto = (from: string, body: string): PayloadWebhook => ({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [{ id: `wamid.${Math.random()}`, from, type: 'text', text: { body } }],
          },
        },
      ],
    },
  ],
});

describe('ping → pong de diagnóstico (solo DEMO, solo celulares del equipo)', () => {
  it('responde «pong» al celular del equipo, sin importar mayúsculas ni espacios', async () => {
    const { servicio, enviarTexto, respuestas, prisma } = montar('DEMO', [EQUIPO]);
    await servicio.procesar(texto('56912345678', '  Ping '));
    expect(enviarTexto).toHaveBeenCalledWith({
      para: '56912345678',
      texto: expect.stringContaining('pong'),
    });
    // No toca citas ni bajas, y solo queda el registro del resultado.
    expect(respuestas.registrarBaja).not.toHaveBeenCalled();
    expect(prisma.tareaContacto.findMany).not.toHaveBeenCalled();
    expect(prisma.mensajeEntrante.create).toHaveBeenCalledOnce();
  });

  it('no responde a un número que no es del equipo', async () => {
    const { servicio, enviarTexto } = montar('DEMO', [EQUIPO]);
    await servicio.procesar(texto('56999999999', 'ping'));
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it('no responde fuera de DEMO', async () => {
    const { servicio, enviarTexto } = montar('QA', []);
    await servicio.procesar(texto('56912345678', 'ping'));
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it('si el envío del «pong» falla, el webhook igual se procesa', async () => {
    const { servicio, prisma } = montar('DEMO', [EQUIPO], true);
    await expect(servicio.procesar(texto('56912345678', 'ping'))).resolves.toEqual({
      estados: 0,
      mensajes: 1,
    });
    expect(prisma.mensajeEntrante.create).toHaveBeenCalledOnce();
  });
});
