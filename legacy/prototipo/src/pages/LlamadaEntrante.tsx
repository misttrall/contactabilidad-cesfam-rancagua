import { useState } from 'react';
import { PhoneIncoming, Search, User, FileText, Plus } from 'lucide-react';
import { motivosLlamada, centros } from '../data/mockData';
import './LlamadaEntrante.css';

const LlamadaEntrante = () => {
  const [rut, setRut] = useState('');
  const [pacienteEncontrado, setPacienteEncontrado] = useState<any>(null);
  const [buscando, setBuscando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [otroMotivo, setOtroMotivo] = useState('');
  const [observacion, setObservacion] = useState('');
  const [centro, setCentro] = useState('');
  const [guardado, setGuardado] = useState(false);

  const buscarPaciente = () => {
    setBuscando(true);
    setTimeout(() => {
      if (rut.length >= 8) {
        setPacienteEncontrado({
          rut: rut,
          nombre: 'José',
          apellidoPaterno: 'Valdés',
          apellidoMaterno: 'Molina',
          edad: 54,
          sexo: 'M',
          telefono: '+56912345678'
        });
      }
      setBuscando(false);
    }, 500);
  };

  const guardarLlamada = () => {
    setGuardado(true);
    setTimeout(() => {
      setGuardado(false);
      setRut('');
      setPacienteEncontrado(null);
      setMotivo('');
      setOtroMotivo('');
      setObservacion('');
      setCentro('');
    }, 2000);
  };

  const motivoSeleccionado = motivosLlamada.find(m => m.id === motivo);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Registro de Llamada Entrante</h1>
        <p>Registrar llamadas que ingresan al call center</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2><Search size={18} /> Buscar Paciente</h2>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>RUT del Paciente</label>
              <div className="input-with-button">
                <input 
                  type="text" 
                  placeholder="12345678-9"
                  value={rut}
                  onChange={(e) => setRut(e.target.value)}
                />
                <button className="btn btn-primary" onClick={buscarPaciente} disabled={!rut || buscando}>
                  <Search size={18} />
                  {buscando ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
            </div>

            {pacienteEncontrado && (
              <div className="paciente-card">
                <div className="paciente-card-header">
                  <User size={20} />
                  <span>Paciente Encontrado</span>
                </div>
                <div className="paciente-card-body">
                  <div className="paciente-nombre">
                    {pacienteEncontrado.nombre} {pacienteEncontrado.apellidoPaterno} {pacienteEncontrado.apellidoMaterno}
                  </div>
                  <div className="paciente-datos">
                    <div><strong>RUT:</strong> {pacienteEncontrado.rut}</div>
                    <div><strong>Edad:</strong> {pacienteEncontrado.edad} años</div>
                    <div><strong>Sexo:</strong> {pacienteEncontrado.sexo === 'M' ? 'Masculino' : 'Femenino'}</div>
                    <div><strong>Teléfono:</strong> {pacienteEncontrado.telefono}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2><PhoneIncoming size={18} /> Datos de la Llamada</h2>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>Centro</label>
              <select value={centro} onChange={(e) => setCentro(e.target.value)}>
                <option value="">Seleccione centro...</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Motivo de la Llamada</label>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                <option value="">Seleccione motivo...</option>
                {motivosLlamada.map((m) => (
                  <option key={m.id} value={m.id}>{m.descripcion}</option>
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
              onClick={guardarLlamada}
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
