import { describe, expect, it } from 'vitest';
import { modulosPermitidos } from '@bh/shared';
import { itemsVisibles, MENU } from './menu';

const etiquetas = (roles: string[]) =>
  itemsVisibles(modulosPermitidos(roles)).map((i) => i.etiqueta);

describe('menú por rol', () => {
  it('funcionaria no ve reportes ni configuración', () => {
    const e = etiquetas(['funcionaria']);
    expect(e).toContain('Pendientes por llamar');
    expect(e).not.toContain('Reportes');
    expect(e).not.toContain('Configuración');
  });
  it('encargado ve reportes pero no configuración', () => {
    const e = etiquetas(['encargado']);
    expect(e).toContain('Reportes');
    expect(e).not.toContain('Configuración');
  });
  it('administrador ve todo el menú', () => {
    expect(etiquetas(['administrador'])).toHaveLength(MENU.length);
  });
  it('sin rol del sistema no ve nada', () => {
    expect(etiquetas(['offline_access'])).toEqual([]);
  });
  it('cada módulo tiene una ruta única', () => {
    const rutas = MENU.map((i) => i.ruta);
    expect(new Set(rutas).size).toBe(rutas.length);
  });
});
