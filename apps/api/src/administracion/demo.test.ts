import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../config';
import { DemoService } from './demo.service';

describe('DemoService fuera de DEMO', () => {
  it('se niega a borrar datos en QA o producción, sin tocar la base de datos', async () => {
    for (const ambiente of ['QA', 'PRODUCCION'] as const) {
      const prisma = { $transaction: vi.fn(), cita: { deleteMany: vi.fn() } };
      const svc = new DemoService(
        prisma as never,
        {} as never,
        {} as never,
        { registrar: vi.fn() } as never,
        { ambiente } as Config,
        { ahora: () => new Date() },
      );
      expect(svc.disponible).toBe(false);
      await expect(svc.restablecer('u1', true)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.cita.deleteMany).not.toHaveBeenCalled();
    }
  });
});
