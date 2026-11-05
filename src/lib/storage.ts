import { get, set, del } from 'idb-keyval';
import type { Cita, LlamadaEntrante, Usuario } from '../data/types';
import { citasSeed, llamadasSeed } from '../data/mockData';

const KEYS = {
  citas: 'fluxor-demo:citas',
  llamadas: 'fluxor-demo:llamadas',
  session: 'fluxor-demo:session',
  version: 'fluxor-demo:version',
} as const;

const DATA_VERSION = 1;

export type DemoSession = {
  userId: string;
  rol: Usuario['rol'];
  nombre: string;
  apellido: string;
  centroId?: string;
};

async function ensureVersion(): Promise<void> {
  const version = await get<number>(KEYS.version);
  if (version !== DATA_VERSION) {
    await set(KEYS.version, DATA_VERSION);
  }
}

export async function loadCitas(): Promise<Cita[]> {
  await ensureVersion();
  const stored = await get<Cita[]>(KEYS.citas);
  if (!stored || stored.length === 0) {
    await set(KEYS.citas, citasSeed);
    return [...citasSeed];
  }
  return stored;
}

export async function saveCitas(citas: Cita[]): Promise<void> {
  await set(KEYS.citas, citas);
}

export async function loadLlamadas(): Promise<LlamadaEntrante[]> {
  await ensureVersion();
  const stored = await get<LlamadaEntrante[]>(KEYS.llamadas);
  if (!stored) {
    await set(KEYS.llamadas, llamadasSeed);
    return [...llamadasSeed];
  }
  return stored;
}

export async function saveLlamadas(llamadas: LlamadaEntrante[]): Promise<void> {
  await set(KEYS.llamadas, llamadas);
}

export async function loadSession(): Promise<DemoSession | null> {
  return (await get<DemoSession>(KEYS.session)) ?? null;
}

export async function saveSession(session: DemoSession | null): Promise<void> {
  if (!session) {
    await del(KEYS.session);
    return;
  }
  await set(KEYS.session, session);
}

export async function resetDemoData(): Promise<{ citas: Cita[]; llamadas: LlamadaEntrante[] }> {
  const citas = [...citasSeed];
  const llamadas = [...llamadasSeed];
  await set(KEYS.citas, citas);
  await set(KEYS.llamadas, llamadas);
  await set(KEYS.version, DATA_VERSION);
  return { citas, llamadas };
}
