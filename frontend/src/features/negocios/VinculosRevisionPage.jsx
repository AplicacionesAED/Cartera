// "Vínculos por revisar": negocios cuyo inmueble no se pudo confirmar con seguridad y referencias de recaudo
// repetidas en Zoho. La app ya usa el vínculo resuelto (ver backend vinculoResolver.js); esta lista es lo que el
// equipo del CRM debe corregir en Zoho. Se puede exportar a Excel para enviársela.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Checkbox } from '../../components/ui/Checkbox.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { getVinculosRevision } from '../../api/negocios.js';
import { estadoToken } from '../../utils/estados.js';
import styles from './NegociosPage.module.css';

const ESTADOS = {
  SIN_VINCULO: { etiqueta: 'Sin vínculo', variante: 'danger' },
  AMBIGUO: { etiqueta: 'Varios inmuebles', variante: 'warning' },
  RESPALDO: { etiqueta: 'Vinculado por código', variante: 'warning' },
  CONFIRMADO: { etiqueta: 'Vinculado', variante: 'success' },
};

// Una sola línea con "…"; el texto completo se ve al pasar el mouse.
function Corto({ ancho, titulo, children }) {
  const texto = titulo ?? (typeof children === 'string' ? children : undefined);
  return (
    <span title={texto} style={{ display: 'block', maxWidth: ancho, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

const textoDetalle = (v) => [v.detalle, ...(v.observaciones ?? [])].filter(Boolean).join(' ');

function exportarExcel(vinculos, duplicadas) {
  const hoja1 = vinculos.map((v) => ({
    'Referencia del negocio': v.referencia,
    'Estado del negocio': v.negocioEstado ?? '',
    Resultado: ESTADOS[v.estado]?.etiqueta ?? v.estado,
    Oportunidad: v.oportunidadNombre ?? '',
    'Etapa de la oportunidad': v.oportunidadEtapa ?? '',
    'Inmueble según la oportunidad': v.oportunidadInmueble ? `${v.oportunidadInmueble}${v.oportunidadTorre ? ` (${v.oportunidadTorre})` : ''}` : v.oportunidadPiso ? `${v.oportunidadPiso} (sin unidad)` : '',
    'Inmueble sugerido': v.sugerido ?? '',
    'Proyecto / Torre (sugerido)': v.sugeridoProyectoTorre ?? '',
    'Referencia que tiene hoy ese inmueble en Zoho': v.sugeridoReferencia ?? '',
    'Nomenclatura (fiducia)': v.nomenclatura ?? '',
    Fideicomiso: v.fideicomiso ?? '',
    'Qué pasó': textoDetalle(v),
    'Qué hacer': v.accionSugerida ?? '',
  }));
  const hoja2 = duplicadas.flatMap((d) =>
    d.inmuebles.map((i) => ({
      'Referencia repetida': d.referencia,
      'Inmuebles con esa referencia': d.cantidad,
      Inmueble: i.nombre,
      'Proyecto / Torre': i.proyectoTorre ?? '',
      'Estado en Zoho': i.estado ?? '',
    }))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja1), 'Negocios por revisar');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja2), 'Referencias repetidas');
  XLSX.writeFile(wb, `vinculos-por-revisar-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function VinculosRevisionPage() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('');
  const [todos, setTodos] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await getVinculosRevision({ search: search || undefined, estado: estado || undefined, soloRevision: todos ? 'false' : 'true' });
      setDatos(res.data);
      setError(null);
    } catch (err) {
      setError(err.message || 'No se pudo cargar');
    }
  }, [search, estado, todos]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  const vinculos = datos?.vinculos ?? [];
  const duplicadas = datos?.duplicadas ?? [];

  return (
    <div className={styles.page}>
      <BackLink to="/negocios">Negocios</BackLink>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Vínculos por revisar</h1>
          <p className={styles.subtitle}>
            Negocios que no se pudieron vincular a un inmueble por nomenclatura y categoría (sin coincidencia, o con varias). La app no los vincula hasta que se corrija el dato; la sugerencia es solo una pista.
            {datos ? ` · ${datos.resumen.pendientes.toLocaleString('es-CO')} por revisar` : ''}
          </p>
        </div>
        <div className={styles.acciones}>
          <Button variant="secondary" onClick={() => exportarExcel(vinculos, duplicadas)} disabled={!datos}>
            <span className={styles.botonInterior}>
              <Download size={14} aria-hidden="true" />
              Exportar a Excel
            </span>
          </Button>
        </div>
      </div>

      <div className={styles.filtros}>
        <div className={styles.filtroBusqueda}>
          <Field label="Buscar">
            {(p) => <TextInput {...p} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Referencia, nomenclatura, inmueble…" />}
          </Field>
        </div>
        <Field label="Resultado">
          {(p) => (
            <Select {...p} value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ESTADOS).map(([k, e]) => (
                <option key={k} value={k}>{e.etiqueta}</option>
              ))}
            </Select>
          )}
        </Field>
        <Checkbox label="Incluir los vinculados y los LIBRE" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
      </div>

      {error && <p className={styles.mensaje}>{error}</p>}
      {!datos && !error && <p className={styles.mensaje}>Cargando…</p>}

      {datos && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Negocio</th>
                <th>Resultado</th>
                <th>Oportunidad</th>
                <th>Inmueble según la oportunidad</th>
                <th>Inmueble sugerido</th>
                <th>Qué pasó</th>
                <th>Qué hacer</th>
              </tr>
            </thead>
            <tbody>
              {vinculos.length === 0 && (
                <tr><td colSpan={7} className={styles.muted}>No hay vínculos por revisar con estos filtros.</td></tr>
              )}
              {vinculos.map((v) => (
                <tr key={v.referencia}>
                  <td>
                    <span className={styles.nowrap}>
                      <Link to={`/negocios/neg-${v.negocioId}`} className={styles.nombre}>{v.referencia}</Link>
                      {v.nomenclatura ? <span className={styles.detalleSec}> · {v.nomenclatura}</span> : null}{' '}
                      <Badge variant={estadoToken(v.negocioEstado)}>{v.negocioEstado ?? '—'}</Badge>
                    </span>
                  </td>
                  <td><Badge variant={ESTADOS[v.estado]?.variante ?? 'neutral'}>{ESTADOS[v.estado]?.etiqueta ?? v.estado}</Badge></td>
                  <td>
                    {v.oportunidadId ? (
                      <Corto ancho={240} titulo={`${v.oportunidadNombre} — ${v.oportunidadEtapa}`}>
                        <Link to={`/oportunidades/${v.oportunidadId}`}>{v.oportunidadNombre}</Link>
                      </Corto>
                    ) : <span className={styles.muted}>Sin oportunidad</span>}
                  </td>
                  <td>
                    {v.oportunidadInmueble ? (
                      <Corto ancho={180}>{`${v.oportunidadInmueble}${v.oportunidadTorre ? ` · ${v.oportunidadTorre}` : ''}`}</Corto>
                    ) : v.oportunidadPiso ? (
                      <Corto ancho={180} titulo="La oportunidad solo declara piso, no la unidad"><span className={styles.muted}>{v.oportunidadPiso} (sin unidad)</span></Corto>
                    ) : <span className={styles.muted}>—</span>}
                  </td>
                  <td>
                    {v.sugerido ? (
                      <Corto ancho={180} titulo={`Referencia que tiene hoy: ${v.sugeridoReferencia ?? 'ninguna'}`}>
                        <Link to={`/negocios/inv-${v.sugeridoId}`}>{v.sugerido}</Link>
                        <span className={styles.detalleSec}> · {v.sugeridoProyectoTorre ?? ''}</span>
                      </Corto>
                    ) : <span className={styles.muted}>—</span>}
                  </td>
                  <td><Corto ancho={320}>{textoDetalle(v) || '—'}</Corto></td>
                  <td><Corto ancho={260}>{v.accionSugerida ?? '—'}</Corto></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {datos && duplicadas.length > 0 && (
        <>
          <div>
            <h2 className={styles.title}>Referencias de recaudo repetidas en Zoho</h2>
            <p className={styles.subtitle}>Más de un inmueble tiene la misma referencia: es lo que cruza negocios con el inmueble equivocado.</p>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Referencia</th><th>Inmuebles que la tienen</th></tr>
              </thead>
              <tbody>
                {duplicadas.map((d) => (
                  <tr key={d.referencia}>
                    <td>{d.referencia}</td>
                    <td>
                      {d.inmuebles.map((i) => (
                        <div key={i.id}>
                          <Link to={`/negocios/inv-${i.id}`}>{i.nombre}</Link>
                          <span className={styles.detalleSec}> · {i.proyectoTorre ?? 's/proyecto'} · {i.estado ?? '—'}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
