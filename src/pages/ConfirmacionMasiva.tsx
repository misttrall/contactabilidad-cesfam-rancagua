import { useState } from 'react';
import { Send, MessageCircle, CheckCircle, XCircle, Clock, Filter, Sparkles } from 'lucide-react';
import { useData } from '../context/DataContext';
import './ConfirmacionMasiva.css';

const ConfirmacionMasiva = () => {
  const { citas, enviarWhatsApp, simularRespuestas } = useData();
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'cronico' | 'morbilidad'>('cronico');
  const [enviando, setEnviando] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const citasFiltradas = citas.filter(
    (c) => (filtroTipo === 'todos' || c.tipo === filtroTipo) && c.estadoConfirmacion === 'sin_enviar'
  );
  const enviados = citas.filter((c) => c.estadoConfirmacion === 'enviado');

  const toggleSeleccion = (id: string) => {
    setSeleccionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const seleccionarTodas = () => {
    if (seleccionadas.length === citasFiltradas.length) {
      setSeleccionadas([]);
    } else {
      setSeleccionadas(citasFiltradas.map((c) => c.id));
    }
  };

  const enviarMasivo = async () => {
    setEnviando(true);
    setMensaje(null);
    // Simula latencia de envío WhatsApp (sandbox / mock)
    await new Promise((r) => setTimeout(r, 800));
    await enviarWhatsApp(seleccionadas);
    setMensaje(`Simulación: ${seleccionadas.length} mensajes marcados como enviados.`);
    setSeleccionadas([]);
    setEnviando(false);
  };

  const handleSimular = async () => {
    setSimulando(true);
    setMensaje(null);
    await new Promise((r) => setTimeout(r, 600));
    const counts = await simularRespuestas();
    setMensaje(
      `Respuestas simuladas → confirmados: ${counts.confirmado}, cancelados: ${counts.cancelado}, sin respuesta: ${counts.sin_respuesta}`
    );
    setSimulando(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Confirmación Masiva por WhatsApp</h1>
        <p>Envío simulado (sandbox). Usa «Simular respuestas» para avanzar estados.</p>
      </div>

      <div className="card">
        <div className="card-header card-header-between">
          <h2>
            <Send size={18} /> Envío Masivo
          </h2>
          <div className="header-actions">
            <div className="filter-group">
              <Filter size={16} />
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as 'todos' | 'cronico' | 'morbilidad')}
              >
                <option value="cronico">Solo Crónicos</option>
                <option value="morbilidad">Solo Morbilidad</option>
                <option value="todos">Todos</option>
              </select>
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="whatsapp-preview">
            <MessageCircle size={20} />
            <div>
              <strong>Mensaje a enviar (plantilla demo):</strong>
              <p>
                &quot;Mañana tiene hora con [Profesional], [Prestación], [Hora]. ¿Va a asistir? Sí /
                No&quot;
              </p>
            </div>
          </div>

          {mensaje && (
            <div className="alert alert-success">
              <CheckCircle size={18} />
              <span>{mensaje}</span>
            </div>
          )}

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={seleccionadas.length === citasFiltradas.length && citasFiltradas.length > 0}
                      onChange={seleccionarTodas}
                    />
                  </th>
                  <th>Paciente</th>
                  <th>Fecha/Hora</th>
                  <th>Profesional</th>
                  <th>Prestación</th>
                  <th>Tipo</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {citasFiltradas.map((cita) => (
                  <tr key={cita.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={seleccionadas.includes(cita.id)}
                        onChange={() => toggleSeleccion(cita.id)}
                      />
                    </td>
                    <td>
                      <div className="patient-cell">
                        <div className="patient-name">
                          {cita.paciente.nombre} {cita.paciente.apellidoPaterno}
                        </div>
                        <div className="patient-rut">{cita.paciente.rut}</div>
                      </div>
                    </td>
                    <td>
                      {cita.fecha} {cita.hora}
                    </td>
                    <td>{cita.profesional}</td>
                    <td>{cita.prestacion}</td>
                    <td>
                      <span className={`badge ${cita.tipo === 'cronico' ? 'badge-info' : 'badge-warning'}`}>
                        {cita.tipo === 'cronico' ? 'Crónico' : 'Morbilidad'}
                      </span>
                    </td>
                    <td>{cita.paciente.telefono}</td>
                    <td>
                      <span className="badge badge-warning">Sin enviar</span>
                    </td>
                  </tr>
                ))}
                {citasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={8}>No hay citas pendientes de envío con este filtro.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="action-bar">
            <span>{seleccionadas.length} seleccionadas · {enviados.length} enviados esperando respuesta</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-accent"
                onClick={() => void handleSimular()}
                disabled={enviados.length === 0 || simulando}
                title="Simula respuestas Sí/No/sin_respuesta sobre los enviados"
              >
                <Sparkles size={18} />
                {simulando ? 'Simulando…' : 'Simular respuestas'}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void enviarMasivo()}
                disabled={seleccionadas.length === 0 || enviando}
              >
                <Send size={18} />
                {enviando ? 'Enviando…' : 'Enviar por WhatsApp (simulado)'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Estado de Confirmaciones</h2>
        </div>
        <div className="card-body">
          <div className="status-grid">
            <div className="status-item">
              <Clock size={20} className="status-icon warning" />
              <div>
                <div className="status-count">
                  {citas.filter((c) => c.estadoConfirmacion === 'sin_enviar').length}
                </div>
                <div className="status-label">Sin enviar</div>
              </div>
            </div>
            <div className="status-item">
              <Send size={20} className="status-icon info" />
              <div>
                <div className="status-count">
                  {citas.filter((c) => c.estadoConfirmacion === 'enviado').length}
                </div>
                <div className="status-label">Enviados</div>
              </div>
            </div>
            <div className="status-item">
              <CheckCircle size={20} className="status-icon success" />
              <div>
                <div className="status-count">
                  {citas.filter((c) => c.estadoConfirmacion === 'confirmado').length}
                </div>
                <div className="status-label">Confirmados</div>
              </div>
            </div>
            <div className="status-item">
              <XCircle size={20} className="status-icon danger" />
              <div>
                <div className="status-count">
                  {citas.filter((c) => c.estadoConfirmacion === 'cancelado').length}
                </div>
                <div className="status-label">Cancelados</div>
              </div>
            </div>
            <div className="status-item">
              <Clock size={20} className="status-icon orange" />
              <div>
                <div className="status-count">
                  {citas.filter((c) => c.estadoConfirmacion === 'sin_respuesta').length}
                </div>
                <div className="status-label">Sin respuesta</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmacionMasiva;
