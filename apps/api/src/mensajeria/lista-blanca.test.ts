import { describe, expect, it, vi } from 'vitest';
import { ErrorCanal, type CanalMensajeria } from './canal';
import { CanalConListaBlanca } from './lista-blanca';

const interno = () =>
  ({
    enviarPlantilla: vi.fn().mockResolvedValue({ proveedorId: 'p1' }),
    enviarTexto: vi.fn().mockResolvedValue({ proveedorId: 'p2' }),
  }) satisfies CanalMensajeria;
const plantilla = (para: string) => ({
  para,
  plantilla: 'x',
  idioma: 'es',
  parametros: [],
  payloadsBotones: [],
});

describe('CanalConListaBlanca (DEMO con WhatsApp real)', () => {
  it('deja pasar a los celulares del equipo (con o sin formato)', async () => {
    const c = interno();
    const canal = new CanalConListaBlanca(c, ['+56 9 1111 2222']);
    await expect(canal.enviarPlantilla(plantilla('56911112222'))).resolves.toEqual({
      proveedorId: 'p1',
    });
    await expect(canal.enviarTexto({ para: '56911112222', texto: 'hola' })).resolves.toEqual({
      proveedorId: 'p2',
    });
  });

  it('bloquea cualquier otro número: error permanente y NADA sale hacia Meta', async () => {
    const c = interno();
    const canal = new CanalConListaBlanca(c, ['+56911112222']);
    const e1 = await canal.enviarPlantilla(plantilla('56900010000')).catch((x: unknown) => x);
    expect(e1).toBeInstanceOf(ErrorCanal);
    expect(e1).toMatchObject({ permanente: true, codigo: 'DEMO_NO_PERMITIDO' });
    await expect(canal.enviarTexto({ para: '56900010000', texto: 'x' })).rejects.toBeInstanceOf(
      ErrorCanal,
    );
    expect(c.enviarPlantilla).not.toHaveBeenCalled();
    expect(c.enviarTexto).not.toHaveBeenCalled();
  });

  it('con la lista vacía bloquea todo', async () => {
    const c = interno();
    const canal = new CanalConListaBlanca(c, []);
    await expect(canal.enviarPlantilla(plantilla('56911112222'))).rejects.toBeInstanceOf(
      ErrorCanal,
    );
    expect(c.enviarPlantilla).not.toHaveBeenCalled();
  });

  it('el mensaje de error no incluye el teléfono', async () => {
    const e = (await new CanalConListaBlanca(interno(), [])
      .enviarPlantilla(plantilla('56911112222'))
      .catch((x: unknown) => x)) as Error;
    expect(e.message).not.toContain('911112222');
  });
});
