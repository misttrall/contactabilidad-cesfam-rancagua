import { useState } from 'react';
import { Upload, FileSpreadsheet, Filter, CheckCircle } from 'lucide-react';
import { centros } from '../data/mockData';
import './CargaCitas.css';

const CargaCitas = () => {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [centroSeleccionado, setCentroSeleccionado] = useState('');
  const [excluirMorbilidad, setExcluirMorbilidad] = useState(true);
  const [cargado, setCargado] = useState(false);

  const handleArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setArchivo(e.target.files[0]);
    }
  };

  const handleCargar = () => {
    if (archivo && centroSeleccionado) {
      setCargado(true);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Cargar Citas desde AVIS</h1>
        <p>Exportar desde AVIS (Excel/PDF) y cargar al sistema</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2><Upload size={18} /> Carga de Archivo</h2>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>Centro</label>
              <select value={centroSeleccionado} onChange={(e) => setCentroSeleccionado(e.target.value)}>
                <option value="">Seleccione centro...</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Archivo Excel (.XLSX, .XLS)</label>
              <div className="file-upload">
                <input type="file" accept=".xlsx,.xls" onChange={handleArchivo} id="file" />
                <label htmlFor="file" className="file-label">
                  <FileSpreadsheet size={24} />
                  <span>{archivo ? archivo.name : 'Seleccionar archivo'}</span>
                </label>
              </div>
            </div>

            <div className="checkbox-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={excluirMorbilidad} 
                  onChange={(e) => setExcluirMorbilidad(e.target.checked)}
                />
                <span>Excluir morbilidad (solo controles crónicos)</span>
              </label>
            </div>

            <button 
              className="btn btn-primary" 
              onClick={handleCargar}
              disabled={!archivo || !centroSeleccionado}
            >
              <Upload size={18} />
              Cargar Citas
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2><Filter size={18} /> Información</h2>
          </div>
          <div className="card-body">
            <div className="info-box">
              <h3>Instrucciones</h3>
              <ul>
                <li>Exportar listado de citas desde AVIS en formato Excel</li>
                <li>Seleccionar el centro correspondiente</li>
                <li>Se recomienda excluir morbilidad (se confirma principalmente controles crónicos con 1 mes o más de anticipación)</li>
                <li>Los datos se cargarán con: Paciente, RUT, Teléfono, Fecha, Hora, Profesional, Prestación, Tipo</li>
              </ul>
            </div>

            {cargado && (
              <div className="success-box">
                <CheckCircle size={24} />
                <div>
                  <strong>Carga exitosa</strong>
                  <p>Se cargaron 15 citas. 12 crónicas, 3 morbilidad excluidas.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {cargado && (
        <div className="card">
          <div className="card-header">
            <h2>Vista Previa - Citas Cargadas</h2>
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
                <tr>
                  <td>12.345.678-9</td>
                  <td>Juan Pérez López</td>
                  <td>+56912345678</td>
                  <td>28-10-2026</td>
                  <td>09:00</td>
                  <td>Dra. Martínez</td>
                  <td>Control Crónico</td>
                  <td><span className="badge badge-info">Crónico</span></td>
                </tr>
                <tr>
                  <td>98.765.432-1</td>
                  <td>María González Silva</td>
                  <td>+56987654321</td>
                  <td>28-10-2026</td>
                  <td>09:30</td>
                  <td>Dr. Torres</td>
                  <td>Control DM2</td>
                  <td><span className="badge badge-info">Crónico</span></td>
                </tr>
                <tr>
                  <td>55.667.788-0</td>
                  <td>Rosa Muñoz Vega</td>
                  <td>+56955667788</td>
                  <td>28-10-2026</td>
                  <td>10:30</td>
                  <td>Dra. Martínez</td>
                  <td>Control HTA</td>
                  <td><span className="badge badge-info">Crónico</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CargaCitas;
