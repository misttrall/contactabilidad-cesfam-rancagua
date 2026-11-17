import { describe, expect, it } from 'vitest';
import { PaginasPublicasController } from './paginas.controller';

describe('páginas públicas (requisito de Meta)', () => {
  const c = new PaginasPublicasController();

  it('la política de privacidad declara datos ficticios y enlaza la eliminación', () => {
    const html = c.politica();
    expect(html).toContain('lang="es-CL"');
    expect(html).toContain('100 % ficticios');
    expect(html).toContain('/eliminacion-datos');
  });

  it('la página de eliminación explica BAJA y la anonimización', () => {
    const html = c.eliminacion();
    expect(html).toContain('BAJA');
    expect(html).toContain('anonimiza');
  });

  it('no incluye correos ni datos personales', () => {
    expect(c.politica() + c.eliminacion()).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
  });
});
