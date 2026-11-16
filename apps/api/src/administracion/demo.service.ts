import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { calcularDv, partesSantiago } from '@bh/shared';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CifradoService } from '../cifrado/cifrado.service';
import type { Config } from '../config';
import { ParametrosService } from '../mensajeria/parametros.service';
import type { Reloj } from '../mensajeria/procesador.service';
import { PrismaService } from '../prisma/prisma.service';
import { CONFIG, RELOJ } from '../tokens';

const CITAS_POR_CENTRO = 14;
const BASE_RUT = 1_000_000; // serie de RUT de prueba, válidos por módulo 11
const HORAS = [
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
];
const TIPOS_CONTROL = ['Control crónico HTA', 'Control crónico DM2', 'Control crónico'];

/**
 * «Restablecer datos de demostración» (RF-21). SOLO existe en el ambiente DEMO: en QA o producción
 * borraría datos reales, así que el servicio mismo se niega (no depende de que la web oculte el botón).
 * Borra los datos OPERATIVOS (pacientes, citas, mensajes, llamadas, cargas...) y conserva el catálogo
 * (centros, motivos, profesionales, parámetros), los usuarios y la bitácora de auditoría (inmutable).
 */
@Injectable()
export class DemoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  get disponible(): boolean {
    return this.config.ambiente === 'DEMO';
  }

  async restablecer(usuarioId: string, sembrar: boolean, ip?: string) {
    if (!this.disponible) {
      throw new ForbiddenException('Restablecer datos solo está disponible en el ambiente DEMO');
    }
    const ahora = this.reloj.ahora();

    const borrados = await this.prisma.$transaction(async (tx) => {
      const llamadasEntrantes = (await tx.llamadaEntrante.deleteMany()).count;
      await tx.mensajeEntrante.deleteMany();
      // Las citas arrastran en cascada sus tareas, mensajes, llamadas salientes y liberaciones.
      const citas = (await tx.cita.deleteMany()).count;
      await tx.envio.deleteMany();
      await tx.consentimiento.deleteMany();
      const pacientes = (await tx.paciente.deleteMany()).count;
      await tx.carga.deleteMany();
      return { citas, pacientes, llamadasEntrantes };
    });

    let sembradas = 0;
    if (sembrar) sembradas = await this.sembrar(usuarioId, ahora);

    await this.auditoria.registrar({
      usuarioId,
      accion: 'demo.restablecer',
      recurso: 'sistema',
      ...(ip ? { ip } : {}),
      detalle: { ...borrados, sembradas },
    });
    return { ...borrados, citasSembradas: sembradas };
  }

  /** Datos ficticios listos para presentar: citas de la fecha de envío sugerida, todas «Sin enviar». */
  private async sembrar(usuarioId: string, ahora: Date): Promise<number> {
    const anticipacion = await this.parametros.leer('envio.anticipacion_horas');
    const fecha = partesSantiago(new Date(ahora.getTime() + anticipacion * 3_600_000)).fecha;
    const centros = await this.prisma.centro.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
    });
    let n = 0;
    let total = 0;

    for (const centro of centros) {
      const profesionales = await this.prisma.profesional.findMany({
        where: { centroId: centro.id, activo: true },
      });
      const carga = await this.prisma.carga.create({
        data: {
          centroId: centro.id,
          usuarioId,
          filasTotales: CITAS_POR_CENTRO,
          filasValidas: CITAS_POR_CENTRO,
          citasCreadas: CITAS_POR_CENTRO,
          citasExistentes: 0,
          morbilidadExcluida: 0,
          repetidasEnArchivo: 0,
          erroresTotal: 0,
          excluyoMorbilidad: true,
        },
      });
      for (let i = 0; i < CITAS_POR_CENTRO; i++, n++) {
        const cuerpo = String(BASE_RUT + n);
        // Con DEMO_TELEFONOS_PRUEBA, los primeros pacientes llevan los celulares reales del equipo.
        const telefono = this.config.demoTelefonos[n] ?? `+569000${String(10_000 + n).slice(-5)}`;
        const prof = profesionales[i % Math.max(profesionales.length, 1)];
        const mayor = i % 3 === 0; // un tercio adultos mayores
        const paciente = await this.prisma.paciente.create({
          data: {
            rut: `${cuerpo}-${calcularDv(cuerpo)}`,
            nombre: `Paciente Demo ${String(n + 1).padStart(3, '0')}`,
            telefonoCifrado: this.cifrado.cifrar(telefono),
            telefonoHash: this.cifrado.hashBusqueda(telefono),
            fechaNacimiento: new Date(
              mayor
                ? `19${48 + (i % 12)}-0${1 + (i % 9)}-15T00:00:00Z`
                : `19${70 + (i % 30)}-0${1 + (i % 9)}-20T00:00:00Z`,
            ),
            sexo: i % 2 === 0 ? 'F' : 'M',
          },
        });
        const nombreProf = prof?.nombre ?? 'Profesional Demo';
        await this.prisma.cita.create({
          data: {
            id: randomUUID(),
            centroId: centro.id,
            pacienteId: paciente.id,
            profesionalId: prof?.id ?? null,
            profesionalNombre: nombreProf,
            profesionalClave: nombreProf.toLowerCase(),
            fecha: new Date(`${fecha}T00:00:00Z`),
            hora: HORAS[i % HORAS.length]!,
            prestacion: TIPOS_CONTROL[i % TIPOS_CONTROL.length]!,
            tipo: 'cronico',
            cargaId: carga.id,
            tarea: { create: {} },
          },
        });
        total++;
      }
    }
    return total;
  }
}
