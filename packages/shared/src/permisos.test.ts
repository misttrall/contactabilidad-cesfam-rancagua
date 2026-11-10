import { describe, expect, it } from 'vitest';
import {
  MODULOS,
  modulosPermitidos,
  puedeAcceder,
  resolverAlcance,
  rolPrincipal,
  type SesionUsuario,
} from './permisos';

const ses = (roles: string[], centroId?: string): SesionUsuario => ({
  id: 'u1',
  nombre: 'Usuario Demo',
  roles,
  centroId,
});

describe('matriz de permisos (tabla 8 del informe)', () => {
  it('funcionaria no ve reportes ni configuración', () => {
    expect(puedeAcceder(['funcionaria'], 'pendientes')).toBe(true);
    expect(puedeAcceder(['funcionaria'], 'reportes')).toBe(false);
    expect(puedeAcceder(['funcionaria'], 'configuracion')).toBe(false);
  });
  it('encargado ve reportes pero no configuración', () => {
    expect(puedeAcceder(['encargado'], 'reportes')).toBe(true);
    expect(puedeAcceder(['encargado'], 'configuracion')).toBe(false);
  });
  it('administrador ve todo', () => {
    expect(modulosPermitidos(['administrador'])).toEqual(MODULOS);
  });
  it('sin rol del sistema no ve nada (roles de Keycloak ajenos se ignoran)', () => {
    expect(modulosPermitidos(['offline_access', 'uma_authorization'])).toEqual([]);
    expect(puedeAcceder([], 'dashboard')).toBe(false);
  });
  it('con varios roles prevalece el de mayor jerarquía', () => {
    expect(rolPrincipal(['funcionaria', 'encargado'])).toBe('encargado');
    expect(rolPrincipal(['encargado', 'administrador', 'funcionaria'])).toBe('administrador');
  });
});

describe('alcance por centro', () => {
  it('funcionaria queda acotada a su centro', () => {
    expect(resolverAlcance(ses(['funcionaria'], 'CSC'))).toEqual({
      tipo: 'centro',
      centroId: 'CSC',
    });
    expect(resolverAlcance(ses(['funcionaria'], 'CSC'), 'CSC')).toEqual({
      tipo: 'centro',
      centroId: 'CSC',
    });
  });
  it('funcionaria que pide otro centro es rechazada (no se filtra en silencio)', () => {
    expect(resolverAlcance(ses(['funcionaria'], 'CSC'), 'CSN').tipo).toBe('prohibido');
  });
  it('funcionaria sin centro asignado queda prohibida (corrige RN-13 del prototipo)', () => {
    expect(resolverAlcance(ses(['funcionaria'])).tipo).toBe('prohibido');
  });
  it('encargado y administrador ven todos y pueden acotar a un centro', () => {
    expect(resolverAlcance(ses(['encargado']))).toEqual({ tipo: 'todos' });
    expect(resolverAlcance(ses(['administrador']), 'CSS')).toEqual({
      tipo: 'centro',
      centroId: 'CSS',
    });
  });
  it('sin rol del sistema queda prohibido', () => {
    expect(resolverAlcance(ses(['otro']), undefined).tipo).toBe('prohibido');
  });
});
