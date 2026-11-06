import { useState } from 'react';
import { Upload, FileSpreadsheet, Filter, CheckCircle, Download, AlertTriangle } from 'lucide-react';
import { centros } from '../data/mockData';
import { parseCitasExcel } from '../lib/excel';
import { useData } from '../context/DataContext';
import type { Cita } from '../data/types';
import './CargaCitas.css';

const CargaCitas = () => {
  const { addCitas } = useData();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [centroSeleccionado, setCentroSeleccionado] = useState('c1');
  const [excluirMorbilidad, setExcluirMorbilidad] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [resultado, setResultado] = useState<{
    citas: Cita[];
    excluidasMorbilidad: number;
  } | null>(null);

  const handleArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    setResultado(null);
    setErrores([]);
    if (e.target.files && e.target.files[0]) {
      setArchivo(e.target.files[0]);
    }
  };

  const handleCargar = async () => {
    if (!archivo || !centroSeleccionado) return;
    const centro = centros.find((c) => c.id === centroSeleccionado);
    if (!centro) return;

    setCargando(true);
    setErrores([]);
    setResultado(null);
    try {
      const parsed = await parseCitasExcel(archivo, centro, excluirMorbilidad);
      if (!parsed.ok) {
        setErrores(parsed.errores);
        return;
      }
      await addCitas(parsed.citas);
      setResultado({ citas: parsed.citas, excluidasMorbilidad: parsed.excluidasMorbilidad });
    } catch (err) {
      setErrores([`No se pudo leer el archivo: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Cargar Citas (plantilla demo)</h1>
        <p>Parseo real de Excel con datos ficticios. No uses exportaciones AVIS reales.</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2>
              <Upload size={18} /> Carga de Archivo
            </h2>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>Centro</label>
              <select value={centroSeleccionado} onChange={(e) => setCentroSeleccionado(e.target.value)}>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Archivo Excel (.xlsx)</label>
              <div className="file-upload">
                <input type="file" accept=".xlsx,.xls" onChange={handleArchivo} id="file" />
                <label htmlFor="file" className="file-label">
                  <FileSpreadsheet size={24} />
                  <span>{archivo ? archivo.name : 'Seleccionar archivo'}</span>
                </label>
              </div>
            </div>

            <div className="checkbox-group" style={{ marginBottom: 16 }}>
              <label>
                <input
                  type="checkbox"
                  checked={excluirMorbilidad}
                  onChange={(e) => setExcluirMorbilidad(e.target.checked)}
                />
                <span>Excluir morbilidad (solo controles crónicos)</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={() => void handleCargar()}
                disabled={!archivo || !centroSeleccionado || cargando}
              >
                <Upload size={18} />
                {cargando ? 'Procesando…' : 'Cargar Citas'}
              </button>
              <a className="btn btn-secondary" href="/plantilla-citas-demo.xlsx" download>
                <Download size={18} />
                Descargar plantilla
              </a>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>
              <Filter size={18} /> Información
            </h2>
          </div>
          <div className="card-body">
            <div className="info-box">
              <h3>Columnas obligatorias</h3>
              <ul>
                <li>RUT, Nombre, ApellidoPaterno, ApellidoMaterno</li>
                <li>Telefono, Edad, Sexo (M/F)</li>
                <li>Fecha, Hora, Profesional, Prestacion</li>
                <li>Tipo: <code>cronico</code> o <code>morbilidad</code></li>
              </ul>
              <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                Solo datos ficticios. Está prohibido subir exportaciones reales de AVIS
                (Ley 19.628 / 20.584).
              </p>
            </div>

            {errores.length > 0 && (
              <div className="alert alert-danger" style={{ marginTop: 16, flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <AlertTriangle size={18} />
                  <strong>Error al cargar</strong>
                </div>
                <ul style={{ margin: '8px 0 0 24px' }}>
                  {errores.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {resultado && (
              <div className="success-box" style={{ marginTop: 16 }}>
                <CheckCircle size={24} />
                <div>
                  <strong>Carga exitosa</strong>
                  <p>
                    Se cargaron {resultado.citas.length} citas
                    {resultado.excluidasMorbilidad > 0
                      ? `. ${resultado.excluidasMorbilidad} morbilidad excluidas.`
                      : '.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {resultado && (
        <div className="card">
          <div className="card-header">
            <h2>Vista previa — citas cargadas</h2>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>RUT</th>
                  <th>Paciente</th>
                  <th>Teléfono</th>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Profesional</th>
                  <th>Prestación</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {resultado.citas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.paciente.rut}</td>
                    <td>
                      {c.paciente.nombre} {c.paciente.apellidoPaterno} {c.paciente.apellidoMaterno}
                    </td>
                    <td>{c.paciente.telefono}</td>
                    <td>{c.fecha}</td>
                    <td>{c.hora}</td>
                    <td>{c.profesional}</td>
                    <td>{c.prestacion}</td>
                    <td>
                      <span className={`badge ${c.tipo === 'cronico' ? 'badge-info' : 'badge-warning'}`}>
                        {c.tipo === 'cronico' ? 'Crónico' : 'Morbilidad'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CargaCitas;
