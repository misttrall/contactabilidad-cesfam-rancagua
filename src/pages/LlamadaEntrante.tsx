import { useMemo, useState } from 'react';
import { PhoneIncoming, Search, User, FileText, Plus } from 'lucide-react';
import { motivosLlamada, centros } from '../data/mockData';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import type { Paciente } from '../data/types';
import './LlamadaEntrante.css';

const LlamadaEntrante = () => {
  const { citas, registrarLlamada } = useData();
  const { session } = useAuth();
  const [rut, setRut] = useState('');
  const [pacienteEncontrado, setPacienteEncontrado] = useState<Paciente | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [otroMotivo, setOtroMotivo] = useState('');
  const [observacion, setObservacion] = useState('');
  const [centro, setCentro] = useState(session?.centroId ?? 'c1');
  const [guardado, setGuardado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const pacientesIndex = useMemo(() => {
    const map = new Map<string, Paciente>();
    citas.forEach((c) => {
      const key = c.paciente.rut.replace(/\./g, '').toLowerCase();
      map.set(key, c.paciente);
    });
    return map;
  }, [citas]);

  const buscarPaciente = () => {
    setBuscando(true);
    setAviso(null);
    setTimeout(() => {
      const key = rut.replace(/\./g, '').toLowerCase();
      const found = pacientesIndex.get(key);
      if (found) {
        setPacienteEncontrado(found);
      } else {
        setPacienteEncontrado(null);
        setAviso('No hay paciente demo con ese RUT. Prueba con 00.000.001-9 o carga la plantilla.');
      }
      setBuscando(false);
    }, 300);
  };

  const guardarLlamada = async () => {
    if (!pacienteEncontrado || !motivo || !centro) return;
    const motivoObj = motivosLlamada.find((m) => m.id === motivo);
    const centroObj = centros.find((c) => c.id === centro);
    if (!motivoObj || !centroObj) return;

    const now = new Date();
    await registrarLlamada({
      id: `ll-${now.getTime()}`,
      fecha: now.toISOString().slice(0, 10),
      hora: now.toTimeString().slice(0, 5),
      centroId: centroObj.id,
      centroNombre: centroObj.nombre,
      paciente: pacienteEncontrado,
      motivoId: motivoObj.id,
      motivoDescripcion:
        motivoObj.descripcion === 'Otros' && otroMotivo ? otroMotivo : motivoObj.descripcion,
      otroMotivo: motivoObj.descripcion === 'Otros' ? otroMotivo : undefined,
      observacion: observacion || undefined,
      atendidoPor: session ? `${session.nombre} ${session.apellido}` : 'Demo',
    });

    setGuardado(true);
    setTimeout(() => {
      setGuardado(false);
      setRut('');
      setPacienteEncontrado(null);
      setMotivo('');
      setOtroMotivo('');
      setObservacion('');
    }, 1500);
  };

  const motivoSeleccionado = motivosLlamada.find((m) => m.id === motivo);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Registro de Llamada Entrante</h1>
        <p>Busca pacientes ficticios ya cargados en la demo</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2>
              <Search size={18} /> Buscar Paciente
            </h2>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>RUT del Paciente (demo)</label>
              <div className="input-with-button">
                <input
                  type="text"
                  placeholder="00.000.001-9"
                  value={rut}
                  onChange={(e) => setRut(e.target.value)}
                />
                <button className="btn btn-primary" onClick={buscarPaciente} disabled={!rut || buscando}>
                  <Search size={18} />
                  {buscando ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
            </div>

            {aviso && <div className="alert alert-warning">{aviso}</div>}

            {pacienteEncontrado && (
              <div className="paciente-card">
                <div className="paciente-card-header">
                  <User size={20} />
                  <span>Paciente Encontrado</span>
                </div>
                <div className="paciente-card-body">
                  <div className="paciente-nombre">
                    {pacienteEncontrado.nombre} {pacienteEncontrado.apellidoPaterno}{' '}
                    {pacienteEncontrado.apellidoMaterno}
                  </div>
                  <div className="paciente-datos">
                    <div>
                      <strong>RUT:</strong> {pacienteEncontrado.rut}
                    </div>
                    <div>
                      <strong>Edad:</strong> {pacienteEncontrado.edad} años
                    </div>
                    <div>
                      <strong>Sexo:</strong>{' '}
                      {pacienteEncontrado.sexo === 'M' ? 'Masculino' : 'Femenino'}
                    </div>
                    <div>
                      <strong>Teléfono:</strong> {pacienteEncontrado.telefono}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>
              <PhoneIncoming size={18} /> Datos de la Llamada
            </h2>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>Centro</label>
              <select value={centro} onChange={(e) => setCentro(e.target.value)}>
                <option value="">Seleccione centro...</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Motivo de la Llamada</label>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                <option value="">Seleccione motivo...</option>
                {motivosLlamada.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.descripcion}
                  </option>
                ))}
              </select>
            </div>

            {motivoSeleccionado?.descripcion === 'Otros' && (
              <div className="form-group">
                <label>Especificar Motivo</label>
                <input
                  type="text"
                  placeholder="Ingrese motivo"
                  value={otroMotivo}
                  onChange={(e) => setOtroMotivo(e.target.value)}
                />
              </div>
            )}

            <div className="form-group">
              <label>Observación (Opcional)</label>
              <textarea
                placeholder="Agregar observación breve..."
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                rows={3}
              />
            </div>

            <div className="info-llamada">
              <FileText size={16} />
              <span>Fecha y hora se registrarán automáticamente</span>
            </div>

            {guardado && (
              <div className="alert alert-success">
                <Plus size={18} />
                <span>Llamada registrada exitosamente</span>
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={() => void guardarLlamada()}
              disabled={!pacienteEncontrado || !motivo || !centro}
            >
              <PhoneIncoming size={18} />
              Registrar Llamada
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LlamadaEntrante;
