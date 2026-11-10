import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claims, crearAppDePrueba } from '../pruebas/ayudas';
import { construirXlsx } from './excel';

const ENC = ['Paciente', 'RUT', 'Teléfono', 'Fecha', 'Hora', 'Profesional', 'Prestación', 'Tipo'];
const FILA = [
  'Paciente Demo 001',
  '1.000.001-7',
  '912345678',
  '20-11-2026',
  '09:30',
  'Dra. Demo Uno',
  'Control crónico',
  'Crónico',
];
const MORB = [
  'Paciente Demo 002',
  '1000002-5',
  '912345679',
  '20-11-2026',
  '10:00',
  'Dr. Demo Dos',
  'Consulta',
  'Morbilidad',
];

describe('API de cargas (validación, sin base de datos)', () => {
  let app: INestApplication;
  let emitir: Awaited<ReturnType<typeof crearAppDePrueba>>['emitir'];
  const http = () => request(app.getHttpServer());
  const auth = async (c: Parameters<typeof emitir>[0]) => `Bearer ${await emitir(c)}`;
  const xlsx = (...filas: unknown[][]) => construirXlsx([ENC, ...filas]);

  beforeAll(async () => {
    ({ app, emitir } = await crearAppDePrueba());
  });
  afterAll(() => app.close());

  it('exige autenticación', async () => {
    await http().post('/api/cargas/validar').attach('archivo', xlsx(FILA), 'p.xlsx').expect(401);
  });

  it('funcionaria: valida su planilla y la vista previa enmascara RUT y teléfono', async () => {
    const res = await http()
      .post('/api/cargas/validar')
      .set('Authorization', await auth(claims.funcionaria))
      .attach('archivo', xlsx(FILA, MORB), 'planilla.xlsx')
      .expect(201);
    expect(res.body).toMatchObject({
      totalFilas: 2,
      validas: 1,
      excluidasMorbilidad: 1,
      erroresTotal: 0,
    });
    expect(res.body.vistaPrevia[0].rut).toBe('1.000.***-7');
    expect(res.body.vistaPrevia[0].telefono).toBe('+56 9 **** 5678');
    expect(JSON.stringify(res.body)).not.toContain('1000001');
    expect(JSON.stringify(res.body)).not.toContain('912345678');
    expect(res.body.columnasReconocidas).toContain('RUT');
  });

  it('excluirMorbilidad=false incluye la morbilidad', async () => {
    const res = await http()
      .post('/api/cargas/validar')
      .set('Authorization', await auth(claims.funcionaria))
      .field('excluirMorbilidad', 'false')
      .attach('archivo', xlsx(FILA, MORB), 'planilla.xlsx')
      .expect(201);
    expect(res.body).toMatchObject({ validas: 2, excluidasMorbilidad: 0 });
  });

  it('informa los errores por fila y columna con el número de fila de Excel', async () => {
    const mala = [...FILA];
    mala[1] = '1000001-9';
    mala[4] = '25:61';
    const res = await http()
      .post('/api/cargas/validar')
      .set('Authorization', await auth(claims.funcionaria))
      .attach('archivo', xlsx(FILA, mala), 'planilla.xlsx')
      .expect(201);
    expect(res.body.validas).toBe(1);
    expect(res.body.errores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fila: 3, columna: 'RUT' }),
        expect.objectContaining({ fila: 3, columna: 'Hora' }),
      ]),
    );
  });

  it('acepta el formato antiguo .xls', async () => {
    const xls = construirXlsx([ENC, FILA], 'xls');
    const res = await http()
      .post('/api/cargas/validar')
      .set('Authorization', await auth(claims.funcionaria))
      .attach('archivo', xls, 'planilla.xls')
      .expect(201);
    expect(res.body.validas).toBe(1);
  });

  it('422 con las columnas que faltan', async () => {
    const res = await http()
      .post('/api/cargas/validar')
      .set('Authorization', await auth(claims.funcionaria))
      .attach(
        'archivo',
        construirXlsx([
          ['Paciente', 'RUT'],
          ['A', '1'],
        ]),
        'p.xlsx',
      )
      .expect(422);
    expect(res.body.faltantes).toEqual(expect.arrayContaining(['Teléfono', 'Hora']));
  });

  describe('archivos no válidos', () => {
    it('sin archivo', async () => {
      await http()
        .post('/api/cargas/validar')
        .set('Authorization', await auth(claims.funcionaria))
        .expect(400);
    });
    it('extensión no permitida (.csv)', async () => {
      await http()
        .post('/api/cargas/validar')
        .set('Authorization', await auth(claims.funcionaria))
        .attach('archivo', Buffer.from('a,b\n1,2'), 'datos.csv')
        .expect(400);
    });
    it('contenido que no es Excel aunque se llame .xlsx', async () => {
      const res = await http()
        .post('/api/cargas/validar')
        .set('Authorization', await auth(claims.funcionaria))
        .attach('archivo', Buffer.from('<html>no soy excel</html>'), 'falso.xlsx')
        .expect(400);
      expect(res.body.message).toContain('no es una planilla Excel');
    });
    it('archivo ZIP dañado', async () => {
      const zipRoto = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(50, 1)]);
      await http()
        .post('/api/cargas/validar')
        .set('Authorization', await auth(claims.funcionaria))
        .attach('archivo', zipRoto, 'roto.xlsx')
        .expect(400);
    });
    it('supera los 5 MB: 413', async () => {
      const grande = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.alloc(5 * 1024 * 1024 + 10),
      ]);
      await http()
        .post('/api/cargas/validar')
        .set('Authorization', await auth(claims.funcionaria))
        .attach('archivo', grande, 'grande.xlsx')
        .expect(413);
    });
  });

  describe('alcance por centro y rol', () => {
    it('funcionaria no puede cargar para otro centro: 403', async () => {
      await http()
        .post('/api/cargas/validar')
        .set('Authorization', await auth(claims.funcionaria))
        .field('centro', 'CSN')
        .attach('archivo', xlsx(FILA), 'p.xlsx')
        .expect(403);
    });
    it('encargado debe indicar el centro: 400; con centro válido: 201; centro inexistente: 404', async () => {
      const h = await auth(claims.encargado);
      await http()
        .post('/api/cargas/validar')
        .set('Authorization', h)
        .attach('archivo', xlsx(FILA), 'p.xlsx')
        .expect(400);
      await http()
        .post('/api/cargas/validar')
        .set('Authorization', h)
        .field('centro', 'CSN')
        .attach('archivo', xlsx(FILA), 'p.xlsx')
        .expect(201);
      await http()
        .post('/api/cargas/validar')
        .set('Authorization', h)
        .field('centro', 'NOEXISTE')
        .attach('archivo', xlsx(FILA), 'p.xlsx')
        .expect(404);
    });
    it('un usuario sin rol del sistema no puede cargar', async () => {
      await http()
        .post('/api/cargas/validar')
        .set('Authorization', await auth(claims.sinRol))
        .attach('archivo', xlsx(FILA), 'p.xlsx')
        .expect(403);
    });
  });

  describe('plantilla', () => {
    it('se descarga como .xlsx y se puede volver a cargar sin errores', async () => {
      const res = await http()
        .get('/api/cargas/plantilla')
        .set('Authorization', await auth(claims.funcionaria))
        .buffer(true)
        .parse((r, cb) => {
          const partes: Buffer[] = [];
          r.on('data', (d: Buffer) => partes.push(d));
          r.on('end', () => cb(null, Buffer.concat(partes)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toContain('plantilla-citas.xlsx');

      const re = await http()
        .post('/api/cargas/validar')
        .set('Authorization', await auth(claims.funcionaria))
        .field('excluirMorbilidad', 'false')
        .attach('archivo', res.body as Buffer, 'plantilla.xlsx')
        .expect(201);
      expect(re.body).toMatchObject({ totalFilas: 3, validas: 3, erroresTotal: 0 });
    });
  });
});
