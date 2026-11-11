import { Link } from '@tanstack/react-router';
import { CircleCheck, Download, FileSpreadsheet, Info, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { apiBlob, ApiError } from '../api/cliente';
import {
  useCentros,
  useImportarPlanilla,
  useMe,
  useResumenCargas,
  useValidarPlanilla,
  type ResultadoImportacion,
  type ResumenValidacion,
} from '../api/consultas';
import { config } from '../config';

const fechaHora = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Santiago',
});

type Paso = 1 | 2 | 3;
const PASOS = ['Centro y archivo', 'Revisión', 'Resultado'] as const;

function Pasos({ actual }: { actual: Paso }) {
  return (
    <ol className="pasos" aria-label="Pasos de la carga">
      {PASOS.map((nombre, i) => (
        <li
          key={nombre}
          aria-current={actual === i + 1 ? 'step' : undefined}
          data-hecho={actual > i + 1}
        >
          <span className="pasos__n">{i + 1}</span> {nombre}
        </li>
      ))}
    </ol>
  );
}

function Dato({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string;
  valor: number;
  tono?: 'ok' | 'alerta';
}) {
  return (
    <div className="dato" data-tono={tono}>
      <span className="dato__valor tabular">{valor}</span>
      <span className="dato__etiqueta">{etiqueta}</span>
    </div>
  );
}

export function Cargas() {
  const idArchivo = useId();
  const me = useMe().data;
  const centros = useCentros();
  const resumenCargas = useResumenCargas();
  const validar = useValidarPlanilla();
  const importar = useImportarPlanilla();

  const [paso, setPaso] = useState<Paso>(1);
  const [centro, setCentro] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [excluir, setExcluir] = useState<boolean | null>(null);
  const [resumen, setResumen] = useState<ResumenValidacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  if (!me) return null;
  // La funcionaria carga siempre en su centro; encargado y administrador eligen.
  const codigoCentro = me.centro ? me.centro.codigo : centro;
  const excluirMorbilidad =
    excluir ?? resumenCargas.data?.opciones.excluirMorbilidadPorDefecto ?? true;
  const params =
    archivo && codigoCentro ? { archivo, centro: codigoCentro, excluirMorbilidad } : null;

  const revisar = () => {
    if (!params) return;
    validar.mutate(params, {
      onSuccess: (r) => {
        setResumen(r);
        setPaso(2);
      },
    });
  };
  const confirmar = () => {
    if (!params) return;
    importar.mutate(params, {
      onSuccess: (r) => {
        setResultado(r);
        setPaso(3);
      },
    });
  };
  const reiniciar = () => {
    setPaso(1);
    setArchivo(null);
    setResumen(null);
    setResultado(null);
    validar.reset();
    importar.reset();
  };
  const descargarPlantilla = async () => {
    setErrorDescarga(null);
    try {
      const url = URL.createObjectURL(await apiBlob('/api/cargas/plantilla'));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla-citas.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorDescarga(e instanceof Error ? e.message : 'No se pudo descargar la plantilla');
    }
  };

  const errorValidacion = validar.error instanceof ApiError ? validar.error : null;
  const faltantes = (errorValidacion?.detalle?.faltantes as string[] | undefined) ?? [];
  const leidos = (errorValidacion?.detalle?.encabezadosLeidos as string[] | undefined) ?? [];

  return (
    <section className="pagina" aria-labelledby="t-cargas">
      <h1 id="t-cargas">Cargar planilla AVIS</h1>
      <Pasos actual={paso} />

      {config.ambiente !== 'PRODUCCION' && (
        <p className="aviso" role="note">
          <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
          Ambiente de prueba: sube solo planillas con datos ficticios, como la plantilla.
        </p>
      )}

      {paso === 1 && (
        <div className="panel">
          <div className="campo-fila">
            <div className="bh-campo">
              <span className="bh-campo__label">Centro</span>
              {me.centro ? (
                <p className="valor-fijo">{me.centro.nombre}</p>
              ) : (
                <select
                  className="bh-input"
                  aria-label="Centro de la planilla"
                  value={centro}
                  onChange={(e) => setCentro(e.target.value)}
                >
                  <option value="">Selecciona el centro…</option>
                  {centros.data?.map((c) => (
                    <option key={c.id} value={c.codigo}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="bh-campo">
              <label className="bh-campo__label" htmlFor={idArchivo}>
                Planilla exportada desde AVIS (.xlsx o .xls)
              </label>
              <input
                id={idArchivo}
                className="bh-input"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  setArchivo(e.target.files?.[0] ?? null);
                  validar.reset();
                }}
              />
            </div>
          </div>

          <label className="casilla">
            <input
              type="checkbox"
              checked={excluirMorbilidad}
              onChange={(e) => setExcluir(e.target.checked)}
            />
            Excluir morbilidad (se confirman principalmente controles crónicos)
          </label>

          <p className="texto-secundario nota">
            <Info size={14} strokeWidth={1.75} aria-hidden="true" /> El archivo se procesa y se
            descarta: no se guarda. Máximo {resumenCargas.data?.opciones.maxMegabytes ?? 5} MB y{' '}
            {resumenCargas.data?.opciones.maxFilas ?? 5000} filas.
          </p>

          {errorValidacion && (
            <div className="mensaje-error" role="alert">
              <strong>{errorValidacion.message}</strong>
              {faltantes.length > 0 && (
                <p>
                  Columnas obligatorias que faltan: {faltantes.join(', ')}.
                  {leidos.length > 0 && <> Encabezados leídos: {leidos.join(', ')}.</>} Revisa el
                  archivo o descarga la plantilla.
                </p>
              )}
            </div>
          )}
          {validar.isError && !errorValidacion && (
            <p className="mensaje-error" role="alert">
              {validar.error.message}
            </p>
          )}
          {errorDescarga && (
            <p className="mensaje-error" role="alert">
              {errorDescarga}
            </p>
          )}

          <div className="acciones">
            <button
              className="bh-boton bh-boton--primario"
              disabled={!params || validar.isPending}
              onClick={revisar}
            >
              <FileSpreadsheet size={16} strokeWidth={1.75} aria-hidden="true" />
              {validar.isPending ? 'Revisando…' : 'Revisar planilla'}
            </button>
            <button className="bh-boton bh-boton--secundario" onClick={descargarPlantilla}>
              <Download size={16} strokeWidth={1.75} aria-hidden="true" />
              Descargar plantilla
            </button>
          </div>
        </div>
      )}

      {paso === 2 && resumen && (
        <div className="panel">
          <div className="datos">
            <Dato etiqueta="Filas leídas" valor={resumen.totalFilas} />
            <Dato etiqueta="Citas nuevas" valor={resumen.citasNuevas} tono="ok" />
            <Dato etiqueta="Ya cargadas" valor={resumen.citasYaCargadas} />
            <Dato etiqueta="Morbilidad excluida" valor={resumen.excluidasMorbilidad} />
            <Dato etiqueta="Repetidas en el archivo" valor={resumen.repetidasEnArchivo} />
            <Dato
              etiqueta="Filas con errores"
              valor={resumen.erroresTotal}
              tono={resumen.erroresTotal ? 'alerta' : undefined}
            />
          </div>

          <p className="texto-secundario">
            Columnas reconocidas: {resumen.columnasReconocidas.join(', ')}.
            {resumen.columnasIgnoradas.length > 0 && (
              <> Se ignoran: {resumen.columnasIgnoradas.join(', ')}.</>
            )}
          </p>

          {resumen.vistaPrevia.length > 0 && (
            <>
              <h2>Vista previa</h2>
              <div
                className="tabla-scroll"
                role="region"
                tabIndex={0}
                aria-label="Tabla con desplazamiento"
              >
                <table className="tabla">
                  <thead>
                    <tr>
                      {[
                        'Paciente',
                        'RUT',
                        'Teléfono',
                        'Fecha',
                        'Hora',
                        'Profesional',
                        'Prestación',
                        'Tipo',
                      ].map((h) => (
                        <th key={h} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.vistaPrevia.map((f, i) => (
                      <tr key={i}>
                        <td>{f.paciente}</td>
                        <td className="tabular">{f.rut}</td>
                        <td className="tabular">{f.telefono}</td>
                        <td className="tabular">{f.fecha}</td>
                        <td className="tabular">{f.hora}</td>
                        <td>{f.profesional}</td>
                        <td>{f.prestacion}</td>
                        <td>{f.tipo === 'cronico' ? 'Crónico' : 'Morbilidad'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {resumen.erroresTotal > 0 && (
            <>
              <h2>Errores por corregir en el Excel</h2>
              <p className="texto-secundario">
                Las filas con errores no se importan. Muestra {resumen.errores.length} de{' '}
                {resumen.erroresTotal}.
              </p>
              <div
                className="tabla-scroll"
                role="region"
                tabIndex={0}
                aria-label="Tabla con desplazamiento"
              >
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Fila</th>
                      <th scope="col">Columna</th>
                      <th scope="col">Problema</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.errores.map((e, i) => (
                      <tr key={i}>
                        <td className="tabular">{e.fila}</td>
                        <td>{e.columna}</td>
                        <td>{e.mensaje}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {importar.isError && (
            <p className="mensaje-error" role="alert">
              No se pudo importar: {importar.error.message}
            </p>
          )}

          <div className="acciones">
            <button
              className="bh-boton bh-boton--primario"
              disabled={resumen.citasNuevas === 0 || importar.isPending}
              onClick={confirmar}
            >
              {importar.isPending
                ? 'Importando…'
                : resumen.citasNuevas === 0
                  ? 'No hay citas nuevas para importar'
                  : `Importar ${resumen.citasNuevas} ${resumen.citasNuevas === 1 ? 'cita' : 'citas'}`}
            </button>
            <button className="bh-boton bh-boton--secundario" onClick={reiniciar}>
              Cambiar archivo
            </button>
          </div>
          {resumen.erroresTotal > 0 && resumen.citasNuevas > 0 && (
            <p className="texto-secundario">
              Se importarán solo las filas válidas; las {resumen.erroresTotal} con errores quedan
              fuera.
            </p>
          )}
        </div>
      )}

      {paso === 3 && resultado && (
        <div className="panel" role="status">
          <h2 className="ok">
            <CircleCheck size={20} strokeWidth={1.75} aria-hidden="true" /> Carga completada
          </h2>
          <div className="datos">
            <Dato etiqueta="Citas creadas" valor={resultado.citasCreadas} tono="ok" />
            <Dato etiqueta="Ya existían" valor={resultado.citasExistentes} />
            <Dato etiqueta="Pacientes nuevos" valor={resultado.pacientesNuevos} />
            <Dato etiqueta="Pacientes actualizados" valor={resultado.pacientesActualizados} />
          </div>
          <p className="texto-secundario">
            Las citas quedaron «Sin enviar». Las citas que ya existían conservan su estado de
            contacto.
          </p>
          <div className="acciones">
            <Link to={'/confirmaciones' as string} className="bh-boton bh-boton--primario">
              Ir a confirmación masiva
            </Link>
            <button className="bh-boton bh-boton--secundario" onClick={reiniciar}>
              Cargar otra planilla
            </button>
          </div>
        </div>
      )}

      <h2>Últimas cargas</h2>
      {resumenCargas.data && resumenCargas.data.historial.length === 0 && (
        <p className="texto-secundario">Todavía no hay cargas.</p>
      )}
      {resumenCargas.data && resumenCargas.data.historial.length > 0 && (
        <div
          className="tabla-scroll"
          role="region"
          tabIndex={0}
          aria-label="Tabla con desplazamiento"
        >
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Centro</th>
                <th scope="col">Citas creadas</th>
                <th scope="col">Ya existían</th>
                <th scope="col">Errores</th>
              </tr>
            </thead>
            <tbody>
              {resumenCargas.data.historial.map((h) => (
                <tr key={h.id}>
                  <td className="tabular">{fechaHora.format(new Date(h.creadaEn))}</td>
                  <td>{h.centro.codigo}</td>
                  <td className="tabular">{h.citasCreadas}</td>
                  <td className="tabular">{h.citasExistentes}</td>
                  <td className="tabular">{h.erroresTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
