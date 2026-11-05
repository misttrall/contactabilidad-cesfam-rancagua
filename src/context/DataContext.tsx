import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import type { Cita, EstadoConfirmacion, LlamadaEntrante } from '../data/types';
import {
  loadCitas,
  loadLlamadas,
  resetDemoData,
  saveCitas,
  saveLlamadas,
} from '../lib/storage';
import { useAuth } from './AuthContext';

type DataContextValue = {
  ready: boolean;
  citas: Cita[];
  llamadas: LlamadaEntrante[];
  pendientesLlamar: Cita[];
  addCitas: (nuevas: Cita[]) => Promise<void>;
  updateCita: (id: string, patch: Partial<Cita>) => Promise<void>;
  updateCitas: (ids: string[], patch: Partial<Cita>) => Promise<void>;
  enviarWhatsApp: (ids: string[]) => Promise<void>;
  simularRespuestas: (ids?: string[]) => Promise<{ confirmado: number; cancelado: number; sin_respuesta: number }>;
  registrarLlamada: (llamada: LlamadaEntrante) => Promise<void>;
  resetDemo: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

const RESPUESTAS: EstadoConfirmacion[] = ['confirmado', 'confirmado', 'confirmado', 'cancelado', 'sin_respuesta'];

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [ready, setReady] = useState(false);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [llamadas, setLlamadas] = useState<LlamadaEntrante[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, l] = await Promise.all([loadCitas(), loadLlamadas()]);
      if (!cancelled) {
        setCitas(c);
        setLlamadas(l);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistCitas = useCallback(async (next: Cita[]) => {
    setCitas(next);
    await saveCitas(next);
  }, []);

  const persistLlamadas = useCallback(async (next: LlamadaEntrante[]) => {
    setLlamadas(next);
    await saveLlamadas(next);
  }, []);

  const addCitas = useCallback(
    async (nuevas: Cita[]) => {
      await persistCitas([...citas, ...nuevas]);
    },
    [citas, persistCitas]
  );

  const updateCita = useCallback(
    async (id: string, patch: Partial<Cita>) => {
      await persistCitas(citas.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    [citas, persistCitas]
  );

  const updateCitas = useCallback(
    async (ids: string[], patch: Partial<Cita>) => {
      const set = new Set(ids);
      await persistCitas(citas.map((c) => (set.has(c.id) ? { ...c, ...patch } : c)));
    },
    [citas, persistCitas]
  );

  const enviarWhatsApp = useCallback(
    async (ids: string[]) => {
      const set = new Set(ids);
      const now = new Date().toISOString();
      await persistCitas(
        citas.map((c) =>
          set.has(c.id) && c.estadoConfirmacion === 'sin_enviar'
            ? { ...c, estadoConfirmacion: 'enviado', fechaEnvio: now, formaContacto: 'whatsapp' }
            : c
        )
      );
    },
    [citas, persistCitas]
  );

  const simularRespuestas = useCallback(
    async (ids?: string[]) => {
      const target = new Set(
        ids ??
          citas.filter((c) => c.estadoConfirmacion === 'enviado').map((c) => c.id)
      );
      const counts = { confirmado: 0, cancelado: 0, sin_respuesta: 0 };
      const now = new Date().toISOString();
      const next = citas.map((c) => {
        if (!target.has(c.id) || c.estadoConfirmacion !== 'enviado') return c;
        const estado = RESPUESTAS[Math.floor(Math.random() * RESPUESTAS.length)];
        if (estado === 'confirmado') counts.confirmado += 1;
        if (estado === 'cancelado') counts.cancelado += 1;
        if (estado === 'sin_respuesta') counts.sin_respuesta += 1;
        return {
          ...c,
          estadoConfirmacion: estado,
          fechaRespuesta: now,
          formaContacto: 'whatsapp' as const,
        };
      });
      await persistCitas(next);
      return counts;
    },
    [citas, persistCitas]
  );

  const registrarLlamada = useCallback(
    async (llamada: LlamadaEntrante) => {
      await persistLlamadas([llamada, ...llamadas]);
    },
    [llamadas, persistLlamadas]
  );

  const resetDemo = useCallback(async () => {
    const { citas: c, llamadas: l } = await resetDemoData();
    setCitas(c);
    setLlamadas(l);
  }, []);


  // Filtrar por centro si la funcionaria tiene uno asignado
  const citasVisibles = useMemo(() => {
    if (session?.rol === 'funcionaria' && session.centroId) {
      return citas.filter((c) => c.centroId === session.centroId);
    }
    return citas;
  }, [citas, session]);

  const llamadasVisibles = useMemo(() => {
    if (session?.rol === 'funcionaria' && session.centroId) {
      return llamadas.filter((l) => l.centroId === session.centroId);
    }
    return llamadas;
  }, [llamadas, session]);

  const pendientesVisibles = useMemo(
    () => citasVisibles.filter((c) => c.estadoConfirmacion === 'sin_respuesta'),
    [citasVisibles]
  );

  const value = useMemo(
    () => ({
      ready,
      citas: citasVisibles,
      llamadas: llamadasVisibles,
      pendientesLlamar: pendientesVisibles,
      addCitas,
      updateCita,
      updateCitas,
      enviarWhatsApp,
      simularRespuestas,
      registrarLlamada,
      resetDemo,
    }),
    [
      ready,
      citasVisibles,
      llamadasVisibles,
      pendientesVisibles,
      addCitas,
      updateCita,
      updateCitas,
      enviarWhatsApp,
      simularRespuestas,
      registrarLlamada,
      resetDemo,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de DataProvider');
  return ctx;
}
