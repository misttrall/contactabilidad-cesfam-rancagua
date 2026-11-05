import { useMemo, useState } from 'react';
import { BarChart3, Filter } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { centros } from '../data/mockData';
import { useData } from '../context/DataContext';
import './Reportes.css';

const COLORS = ['#1E5BB8', '#00C2B8', '#ffc107', '#17a2b8', '#6c757d', '#28a745', '#dc3545'];

const Reportes = () => {
  const { citas, llamadas } = useData();
  const [centroId, setCentroId] = useState('todos');

  const citasFiltradas = useMemo(
    () => (centroId === 'todos' ? citas : citas.filter((c) => c.centroId === centroId)),
    [citas, centroId]
  );
  const llamadasFiltradas = useMemo(
    () => (centroId === 'todos' ? llamadas : llamadas.filter((l) => l.centroId === centroId)),
    [llamadas, centroId]
  );

  const datosConfirmacion = useMemo(() => {
    const byCentro = new Map<string, { name: string; confirmados: number; sinRespuesta: number; cancelados: number; enviados: number }>();
    citasFiltradas.forEach((c) => {
      const key = c.centroId;
      if (!byCentro.has(key)) {
        byCentro.set(key, {
          name: c.centroNombre.replace(' (demo)', ''),
          confirmados: 0,
          sinRespuesta: 0,
          cancelados: 0,
          enviados: 0,
        });
      }
      const row = byCentro.get(key)!;
      if (c.estadoConfirmacion === 'confirmado') row.confirmados += 1;
      if (c.estadoConfirmacion === 'sin_respuesta') row.sinRespuesta += 1;
      if (c.estadoConfirmacion === 'cancelado') row.cancelados += 1;
      if (c.estadoConfirmacion === 'enviado') row.enviados += 1;
    });
    return Array.from(byCentro.values());
  }, [citasFiltradas]);

  const datosMotivos = useMemo(() => {
    const map = new Map<string, number>();
    llamadasFiltradas.forEach((l) => {
      map.set(l.motivoDescripcion, (map.get(l.motivoDescripcion) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [llamadasFiltradas]);

  const demografia = useMemo(() => {
    const rows = centros.map((centro) => {
      const ll = llamadasFiltradas.filter((l) => l.centroId === centro.id);
      return {
        centro: centro.nombre.replace(' (demo)', ''),
        total: ll.length,
        menor18: ll.filter((l) => l.paciente.edad < 18).length,
        a18_44: ll.filter((l) => l.paciente.edad >= 18 && l.paciente.edad <= 44).length,
        a45_64: ll.filter((l) => l.paciente.edad >= 45 && l.paciente.edad <= 64).length,
        a65: ll.filter((l) => l.paciente.edad >= 65).length,
        m: ll.filter((l) => l.paciente.sexo === 'M').length,
        f: ll.filter((l) => l.paciente.sexo === 'F').length,
      };
    }).filter((r) => r.total > 0 || centroId === 'todos');

    const totals = rows.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        menor18: acc.menor18 + r.menor18,
        a18_44: acc.a18_44 + r.a18_44,
        a45_64: acc.a45_64 + r.a45_64,
        a65: acc.a65 + r.a65,
        m: acc.m + r.m,
        f: acc.f + r.f,
      }),
      { total: 0, menor18: 0, a18_44: 0, a45_64: 0, a65: 0, m: 0, f: 0 }
    );

    return { rows, totals };
  }, [llamadasFiltradas, centroId]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Reportes</h1>
        <p>Estadísticas calculadas solo desde los datos almacenados en esta demo</p>
      </div>

      <div className="card">
        <div className="card-header card-header-between">
          <h2>
            <BarChart3 size={18} /> Filtros
          </h2>
          <div className="header-actions">
            <div className="filter-group">
              <Filter size={16} />
              <select value={centroId} onChange={(e) => setCentroId(e.target.value)}>
                <option value="todos">Todos los centros</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2>Confirmaciones por Centro</h2>
          </div>
          <div className="card-body">
            {datosConfirmacion.length === 0 ? (
              <div className="empty-state">Sin datos de citas para graficar</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={datosConfirmacion}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="confirmados" fill="#28a745" name="Confirmados" />
                  <Bar dataKey="sinRespuesta" fill="#fd7e14" name="Sin respuesta" />
                  <Bar dataKey="cancelados" fill="#dc3545" name="Cancelados" />
                  <Bar dataKey="enviados" fill="#17a2b8" name="Enviados" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Motivos de Llamadas Entrantes</h2>
          </div>
          <div className="card-body">
            {datosMotivos.length === 0 ? (
              <div className="empty-state">Sin llamadas para graficar</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={datosMotivos}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {datosMotivos.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Llamadas entrantes por edad y sexo (desde datos demo)</h2>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Centro</th>
                <th>Total</th>
                <th>Menor 18</th>
                <th>18-44</th>
                <th>45-64</th>
                <th>65+</th>
                <th>Masculino</th>
                <th>Femenino</th>
              </tr>
            </thead>
            <tbody>
              {demografia.rows.map((r) => (
                <tr key={r.centro}>
                  <td>{r.centro}</td>
                  <td>{r.total}</td>
                  <td>{r.menor18}</td>
                  <td>{r.a18_44}</td>
                  <td>{r.a45_64}</td>
                  <td>{r.a65}</td>
                  <td>{r.m}</td>
                  <td>{r.f}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>
                  <strong>TOTAL</strong>
                </td>
                <td>
                  <strong>{demografia.totals.total}</strong>
                </td>
                <td>
                  <strong>{demografia.totals.menor18}</strong>
                </td>
                <td>
                  <strong>{demografia.totals.a18_44}</strong>
                </td>
                <td>
                  <strong>{demografia.totals.a45_64}</strong>
                </td>
                <td>
                  <strong>{demografia.totals.a65}</strong>
                </td>
                <td>
                  <strong>{demografia.totals.m}</strong>
                </td>
                <td>
                  <strong>{demografia.totals.f}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reportes;
