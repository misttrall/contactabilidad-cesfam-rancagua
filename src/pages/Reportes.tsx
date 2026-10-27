import { BarChart3, Download, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { centros } from '../data/mockData';
import './Reportes.css';

const Reportes = () => {
  const datosConfirmacion = [
    { name: 'CESFAM Centro', confirmados: 45, sinRespuesta: 12, cancelados: 3 },
    { name: 'CESFAM Norte', confirmados: 38, sinRespuesta: 15, cancelados: 2 },
    { name: 'CESFAM Sur', confirmados: 52, sinRespuesta: 8, cancelados: 4 },
    { name: 'CESFAM Oriente', confirmados: 41, sinRespuesta: 10, cancelados: 1 },
  ];

  const datosMotivos = [
    { name: 'Solicitud de hora', value: 35 },
    { name: 'Consulta de resultados', value: 25 },
    { name: 'Reagendamiento', value: 18 },
    { name: 'Cambio de datos', value: 12 },
    { name: 'Otros', value: 10 },
  ];

  const COLORS = ['#0066cc', '#28a745', '#ffc107', '#17a2b8', '#6c757d'];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Reportes</h1>
        <p>Estadísticas de confirmación y llamadas entrantes</p>
      </div>

      <div className="card">
        <div className="card-header card-header-between">
          <h2><BarChart3 size={18} /> Filtros</h2>
          <div className="header-actions">
            <div className="filter-group">
              <Filter size={16} />
              <select>
                <option value="todos">Todos los centros</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <select>
                <option value="hoy">Hoy</option>
                <option value="ayer">Ayer</option>
                <option value="semana">Última semana</option>
                <option value="mes">Último mes</option>
              </select>
            </div>
            <button className="btn btn-secondary">
              <Download size={18} />
              Exportar Excel
            </button>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2>Confirmaciones por Centro</h2>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={datosConfirmacion}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="confirmados" fill="#28a745" name="Confirmados" />
                <Bar dataKey="sinRespuesta" fill="#fd7e14" name="Sin respuesta" />
                <Bar dataKey="cancelados" fill="#dc3545" name="Cancelados" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Motivos de Llamadas Entrantes</h2>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={datosMotivos}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {datosMotivos.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Reporte Detallado - Llamadas Entrantes por Edad y Sexo</h2>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Centro</th>
                <th>Total Llamadas</th>
                <th>Menor 18</th>
                <th>18-44</th>
                <th>45-64</th>
                <th>65+</th>
                <th>Masculino</th>
                <th>Femenino</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CESFAM Centro</td>
                <td>45</td>
                <td>3</td>
                <td>12</td>
                <td>18</td>
                <td>12</td>
                <td>20</td>
                <td>25</td>
              </tr>
              <tr>
                <td>CESFAM Norte</td>
                <td>38</td>
                <td>5</td>
                <td>10</td>
                <td>15</td>
                <td>8</td>
                <td>16</td>
                <td>22</td>
              </tr>
              <tr>
                <td>CESFAM Sur</td>
                <td>52</td>
                <td>4</td>
                <td>16</td>
                <td>20</td>
                <td>12</td>
                <td>24</td>
                <td>28</td>
              </tr>
              <tr>
                <td>CESFAM Oriente</td>
                <td>41</td>
                <td>2</td>
                <td>14</td>
                <td>16</td>
                <td>9</td>
                <td>18</td>
                <td>23</td>
              </tr>
              <tr className="total-row">
                <td><strong>TOTAL</strong></td>
                <td><strong>176</strong></td>
                <td><strong>14</strong></td>
                <td><strong>52</strong></td>
                <td><strong>69</strong></td>
                <td><strong>41</strong></td>
                <td><strong>78</strong></td>
                <td><strong>98</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reportes;
