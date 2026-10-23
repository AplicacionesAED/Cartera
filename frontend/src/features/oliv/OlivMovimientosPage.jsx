// Lista global de movimientos importados de los Excel de Oliv. Cada fila
// ya trae Propietario/Encargo/Concepto/Valor como columnas directas
// (columnas conocidas del Excel real "Saldos Acumulados por Concepto y
// Unidad", ver backend/olivEncargo.service.js) y el Inmueble vinculado --
// cruzado por esa misma columna Encargo (= Referencia de Recaudo) contra la
// Oportunidad y de ahí a la Unidad de HubSpot. Pedido explícito del usuario
// (2026-09-14): "la idea es que el movimiento te diga todo específicamente";
// columna Encargo agregada aparte (mismo día) porque antes solo se usaba
// internamente para el cruce con Inmueble, sin mostrarse. Propietario e
// Inmueble enlazan AMBOS al mismo Negocio (mov.negocioId, mismo día: "que
// vincule el propietario del negocio [...] igual que vincula el
// inmueble") -- Propietario enlaza siempre que haya negocio (incluso sin
// inmueble vinculado en HubSpot todavía), Inmueble solo cuando además hay
// unidad resuelta.
// Al expandir una fila se sigue viendo el resto de columnas crudas del
// Excel (Identificación, Estado, Valor de la unidad, etc.), con separadores
// de miles cuando el nombre de columna sugiere que es plata (ver
// utils/formatCelda.js) -- antes se mostraban sin ningún formato.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight, Download } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { listMovimientosOliv } from '../../api/oliv.js';
import { formatCOP, formatDate } from '../../utils/format.js';
import { formatCelda } from '../../utils/formatCelda.js';
import { traerTodasLasPaginas } from '../../utils/exportarExcelColumnas.js';
import { exportarMovimientosOlivExcel } from './movimientosOlivExport.js';
import base from '../negocios/NegociosPage.module.css';
import styles from '../fiducia/MovimientosPage.module.css';

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function iniciales(nombre = '') {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? partes[partes.length - 1][0] : ''}`.toUpperCase() || '?';
}

function MovimientoRow({ mov }) {
  const [expanded, setExpanded] = useState(false);
  const datos = mov.datos || {};
  const campos = Object.keys(datos);

  return (
    <>
      <tr className={base.filaClicable} onClick={() => setExpanded((e) => !e)}>
        <td className={styles.chevronCol}>
          <ChevronRight size={14} strokeWidth={2.25} className={`${styles.chevron} ${expanded ? styles.chevronAbierto : ''}`} aria-hidden="true" />
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>{mov.fecha ? formatDate(mov.fecha) : <span className={base.muted}>—</span>}</td>
        <td>
          {mov.propietario ? (
            <div className={base.persona}>
              <span className={base.avatar}>{iniciales(mov.propietario)}</span>
              <div className={base.celdaTitulo}>
                {mov.negocioId ? (
                  <Link to={`/oliv/negocios/${mov.negocioId}`} className={`${styles.enlaceTabla} ${styles.nombreLargo}`} onClick={(e) => e.stopPropagation()}>{mov.propietario}</Link>
                ) : (
                  <span className={styles.nombreLargo}>{mov.propietario}</span>
                )}
                {mov.referencia && <span className={styles.referencia}>Encargo {mov.referencia}</span>}
              </div>
            </div>
          ) : (
            <span className={styles.referencia}>{mov.referencia ?? '—'}</span>
          )}
        </td>
        <td>{mov.concepto ? <span className={styles.tipo} title={mov.concepto}>{mov.concepto}</span> : <span className={base.muted}>—</span>}</td>
        <td className={base.derecha}><span className={styles.valor}>{mov.valor != null ? formatCOP(mov.valor) : '—'}</span></td>
        <td style={{ whiteSpace: 'nowrap' }}>
          {mov.inmueble ? (
            <Link to={`/oliv/negocios/${mov.negocioId}`} className={styles.enlaceTabla} onClick={(e) => e.stopPropagation()}>
              {mov.inmueble.codigoUnidad ?? mov.inmueble.torre ?? 'Ver negocio'}
            </Link>
          ) : (
            <span className={base.muted}>—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className={styles.filaExpandida}>
          <td colSpan={6}>
            <div className={styles.detalle}>
              <p className={styles.detalleTitulo}>Detalle del movimiento</p>
              {campos.length === 0 ? (
                <p className={base.muted}>Esta fila no trae ningún dato.</p>
              ) : (
                <div className={styles.gridExpandido}>
                  {campos.map((col) => {
                    const display = formatCelda(col, datos[col]);
                    return (
                      <div key={col}>
                        <p className={styles.miniLabel}>{col}</p>
                        <p className={styles.miniValor}>{display ?? <span className={styles.sinDato}>—</span>}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function OlivMovimientosPage() {
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);

  const [search, setSearch] = useState('');
  const [hojaFilter, setHojaFilter] = useState('');

  const debouncedSearch = useDebounce(search);
  const filtrosRef = useRef({});
  filtrosRef.current = { debouncedSearch, hojaFilter };

  const cargar = useCallback((p = 1) => {
    const { debouncedSearch: s, hojaFilter: h } = filtrosRef.current;
    setCargando(true);
    listMovimientosOliv({ search: s, hoja: h, page: p, limit: 50 })
      .then((res) => { setResultado(res.data); setPagina(p); })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(1); }, [debouncedSearch, hojaFilter, cargar]);

  async function handleExport() {
    const { debouncedSearch: s, hojaFilter: h } = filtrosRef.current;
    setExportando(true);
    try {
      const filas = await traerTodasLasPaginas(listMovimientosOliv, { search: s, hoja: h });
      if (filas.length === 0) return;
      await exportarMovimientosOlivExcel(filas);
    } catch (err) {
      window.alert(`Error al exportar los movimientos: ${err.message}`);
    } finally {
      setExportando(false);
    }
  }

  function clearAll() {
    setSearch('');
    setHojaFilter('');
  }
  const hasFilters = search || hojaFilter;

  const pagination = resultado?.pagination;
  const movimientos = resultado?.data || [];
  const hojas = resultado?.hojas || [];

  return (
    <div className={base.page}>
      <div className={base.header}>
        <div>
          <h1 className={base.title}>Movimientos de Oliv</h1>
          <p className={base.subtitle}>
            Movimientos importados de los Excel de Encargos{pagination ? ` · ${pagination.total.toLocaleString('es-CO')} resultados` : ''}
          </p>
        </div>
        <div className={base.acciones}>
          <Button variant="secondary" onClick={handleExport} disabled={exportando || !pagination || pagination.total === 0}>
            <span className={base.botonInterior}>
              <Download size={14} aria-hidden="true" />
              {exportando ? 'Exportando…' : 'Exportar a Excel'}
            </span>
          </Button>
        </div>
      </div>

      <div className={base.filtros}>
        <div className={base.filtroBusqueda}>
          <Field
            label={
              <span className={base.labelConIcono}>
                <Search size={13} />
                Buscar
              </span>
            }
          >
            {(p) => <TextInput {...p} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Propietario o cualquier dato de la fila…" />}
          </Field>
        </div>
        {hojas.length > 0 && (
          <Field label="Hoja">
            {(p) => (
              <Select {...p} value={hojaFilter} onChange={(e) => setHojaFilter(e.target.value)}>
                <option value="">Todas las hojas</option>
                {hojas.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            )}
          </Field>
        )}
        {hasFilters && (
          <button type="button" className={base.limpiar} onClick={clearAll}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className={base.tableWrap}>
        {cargando && !resultado ? (
          <p className={base.mensaje}>Cargando…</p>
        ) : movimientos.length === 0 ? (
          <div className={base.vacio}>
            <p className={base.vacioTitulo}>Sin movimientos</p>
            <p className={base.vacioTexto}>{hasFilters ? 'Ajusta los filtros para ver resultados.' : 'Sube un Excel en Encargos para importar movimientos.'}</p>
          </div>
        ) : (
          <>
            <table className={base.table}>
              <thead>
                <tr>
                  <th className={styles.chevronCol} />
                  <th>Fecha</th>
                  <th>Propietario</th>
                  <th>Concepto</th>
                  <th className={base.derecha}>Valor</th>
                  <th>Inmueble</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((mov) => <MovimientoRow key={mov.id} mov={mov} />)}
              </tbody>
            </table>
            {pagination && <Pagination page={pagina} pageSize={pagination.limit} total={pagination.total} onPageChange={cargar} />}
          </>
        )}
      </div>
    </div>
  );
}
