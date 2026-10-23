// Adaptado de zoho-payment-tracker/frontend/src/pages/FiduciaMovimientos.jsx.
// Ojo: en el legado esta pantalla NO usa el endpoint propio de Fiducia
// (`/api/fiducia/movimientos`, que de hecho queda huérfano -- ninguna
// página lo llama) sino `/api/negocios/movimientos` (getAllNegocioMovimientos):
// todos los movimientos con el contexto de Negocio ya resuelto (Fideicomiso/
// Nomenclatura/Estado/compradores) -- ver negocio.service.js:listMovimientos,
// portado durante la fase de Negocios. Mismos filtros, misma fila expandible
// con el grid completo de campos crudos, y la misma exportación a Excel
// estilizada (ExcelJS -- xlsx/SheetJS no permite estilos en su build libre),
// con el color de marca de Cartera en vez del teal de Baía Kristal.
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, ChevronRight, Download } from 'lucide-react';
import ExcelJS from 'exceljs';
import { Button } from '../../components/ui/Button.jsx';
import { ConceptoHint } from '../../components/ui/ConceptoHint.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { MultiSelect } from '../../components/ui/MultiSelect.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { listMovimientosNegocios, exportMovimientosNegocios } from '../../api/negocios.js';
import { formatExcelDate } from '../../utils/format.js';
import { filtrarKeysMovimiento } from '../../utils/columnasExcluidas.js';
import { descripcionProyecto, obtenerProyecto } from '../../utils/proyectos.js';
import { etiquetaCampoMovimiento, valorCampoMovimiento } from '../../utils/movimientoCampos.js';
import base from '../negocios/NegociosPage.module.css';
import styles from './MovimientosPage.module.css';

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function formatCOP(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return null;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

function formatCell(key, value) {
  if (value == null || value === '') return null;
  const k = (key || '').toLowerCase();
  if (k.includes('fecha')) {
    const f = formatExcelDate(value);
    return f !== '—' ? f : String(value);
  }
  if (k.includes('valor') || k.includes('monto') || k.includes('saldo') || k.includes('cuota') || k.includes('capital') ||
      k.includes('abono') || k.includes('descuento') || k.includes('credito') || k.includes('crédito') ||
      k.includes('aporte') || k.includes('importe') || k.includes('acreditacion') || k.includes('acreditación') ||
      k.includes('anticipo') || k.includes('canje')) {
    const cop = formatCOP(value);
    return cop !== null ? cop : String(value);
  }
  return String(value);
}

function cleanNombre(nombre) {
  if (!nombre) return null;
  return nombre.replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '');
}

function shortFideicomiso(raw) {
  if (!raw) return null;
  return String(raw).replace(/^\d+[\s-]+/, '').replace(/^P\.?A\.?\s*/i, '').trim();
}

const PRESETS = [
  { label: 'Último mes', months: 1 },
  { label: 'Últimos 3 meses', months: 3 },
  { label: 'Últimos 6 meses', months: 6 },
  { label: 'Último año', months: 12 },
];

function iniciales(nombre = '') {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? partes[partes.length - 1][0] : ''}`.toUpperCase() || '?';
}

function MovimientoRow({ mov }) {
  const [expanded, setExpanded] = useState(false);
  const datos = mov.datos || {};
  const neg = mov.negocio;

  const fecha = datos['Fecha Contable'] ? formatExcelDate(datos['Fecha Contable']) : null;
  const tipo = datos['Tipo Movimiento'] || datos['Concepto'] || null;
  const valor = datos['Valor'] ? formatCOP(datos['Valor']) : null;

  const compradorPrincipal = cleanNombre(neg?.compradores?.[0]?.nombre);
  const extraCompradores = (neg?.compradores?.length ?? 0) - 1;
  const allFields = filtrarKeysMovimiento(Object.keys(datos));
  const proyecto = neg?.fideicomiso ? shortFideicomiso(neg.fideicomiso) : null;

  return (
    <>
      <tr className={base.filaClicable} onClick={() => setExpanded((e) => !e)}>
        <td className={styles.chevronCol}>
          <ChevronRight size={14} strokeWidth={2.25} className={`${styles.chevron} ${expanded ? styles.chevronAbierto : ''}`} aria-hidden="true" />
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>{fecha ?? <span className={base.muted}>—</span>}</td>
        <td>
          <div className={base.celdaTitulo}>
            <span className={base.nombre}>{neg?.nomenclatura ?? '—'}</span>
            {proyecto && <span className={base.detalleSec}>{proyecto}</span>}
          </div>
        </td>
        <td>
          {compradorPrincipal ? (
            <div className={base.persona}>
              <span className={base.avatar}>{iniciales(compradorPrincipal)}</span>
              <div className={base.celdaTitulo}>
                <span className={styles.nombreLargo}>
                  {compradorPrincipal}
                  {extraCompradores > 0 && <span className={styles.extra}>+{extraCompradores}</span>}
                </span>
              </div>
            </div>
          ) : (
            <span className={base.muted}>—</span>
          )}
        </td>
        <td>
          {neg?.enlaceId ? (
            <Link to={`/negocios/${neg.enlaceId}`} className={styles.referencia} onClick={(e) => e.stopPropagation()} title="Abrir el negocio">{mov.referencia}</Link>
          ) : (
            <span className={styles.referencia}>{mov.referencia}</span>
          )}
        </td>
        <td>{tipo ? <span className={styles.tipo} title={tipo}>{tipo}</span> : <span className={base.muted}>—</span>}</td>
        <td className={base.derecha}><span className={styles.valor}>{valor ?? '—'}</span></td>
      </tr>
      {expanded && (
        <tr className={styles.filaExpandida}>
          <td colSpan={7}>
            <div className={styles.detalle}>
              <p className={styles.detalleTitulo}>Detalle del movimiento</p>
              <div className={styles.gridExpandido}>
                {allFields.map((col) => {
                  const v = valorCampoMovimiento(col, datos[col]);
                  const display = v != null && v !== '' ? (formatCell(col, v) ?? String(v)) : null;
                  return (
                    <div key={col}>
                      <p className={styles.miniLabel}>
                        {etiquetaCampoMovimiento(col)}
                        <ConceptoHint columna={col} hoja="movimiento" />
                      </p>
                      <p className={styles.miniValor}>{display ?? <span className={styles.sinDato}>—</span>}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function MovimientosPage() {
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);

  const [search, setSearch] = useState('');
  const [fideicomisoFilter, setFideicomisoFilter] = useState([]);
  const [estadoFilter, setEstadoFilter] = useState([]);
  const [tipoMovFilter, setTipoMovFilter] = useState([]);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [datePreset, setDatePreset] = useState('');

  const debouncedSearch = useDebounce(search);
  const filtrosRef = useRef({});
  filtrosRef.current = { debouncedSearch, fideicomisoFilter, estadoFilter, tipoMovFilter, fechaDesde, fechaHasta };

  const cargar = useCallback((p = 1) => {
    const { debouncedSearch: s, fideicomisoFilter: f, estadoFilter: e, tipoMovFilter: tm, fechaDesde: fd, fechaHasta: fh } = filtrosRef.current;
    setCargando(true);
    listMovimientosNegocios({ search: s, fideicomiso: f, estado: e, tipoMovimiento: tm, fechaDesde: fd, fechaHasta: fh, page: p, limit: 50 })
      .then((res) => { setResultado(res.data); setPagina(p); })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(1); }, [debouncedSearch, fideicomisoFilter, estadoFilter, tipoMovFilter, fechaDesde, fechaHasta, cargar]);

  function clearAll() {
    setSearch(''); setFideicomisoFilter([]); setEstadoFilter([]); setTipoMovFilter([]); setFechaDesde(''); setFechaHasta(''); setDatePreset('');
  }
  const hasFilters = search || fideicomisoFilter.length || estadoFilter.length || tipoMovFilter.length || fechaDesde || fechaHasta;

  async function handleExport() {
    const { debouncedSearch: s, fideicomisoFilter: f, estadoFilter: e, tipoMovFilter: tm, fechaDesde: fd, fechaHasta: fh } = filtrosRef.current;
    setExportando(true);
    try {
      const res = await exportMovimientosNegocios({ search: s, fideicomiso: f, estado: e, tipoMovimiento: tm, fechaDesde: fd, fechaHasta: fh });
      const rows = res.data?.data || [];
      if (rows.length === 0) return;

      const datosKeys = [];
      const seen = new Set();
      for (const mov of rows) {
        for (const k of filtrarKeysMovimiento(Object.keys(mov.datos || {}))) {
          if (!seen.has(k)) { seen.add(k); datosKeys.push(k); }
        }
      }

      const headers = ['Referencia', 'Proyecto', 'Nomenclatura', 'Comprador(es)', 'Cédula(s)', 'Estado negocio', ...datosKeys.map(etiquetaCampoMovimiento)];
      const excelRows = rows.map((mov) => {
        const neg = mov.negocio;
        const compradores = (neg?.compradores || []).map((c) => cleanNombre(c.nombre)).filter(Boolean).join(' | ');
        const cedulas = (neg?.compradores || []).map((c) => c.nroId || '').filter(Boolean).join(' | ');
        const fila = [
          mov.referencia ?? '',
          neg?.fideicomiso ? shortFideicomiso(neg.fideicomiso) : '',
          neg?.nomenclatura ?? '',
          compradores,
          cedulas,
          neg?.estado ?? '',
        ];
        const datos = mov.datos || {};
        for (const k of datosKeys) {
          const v = valorCampoMovimiento(k, datos[k]);
          fila.push(v != null && v !== '' ? (formatCell(k, v) ?? String(v)) : '');
        }
        return fila;
      });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Movimientos');
      ws.addRow(headers);
      excelRows.forEach((fila) => ws.addRow(fila));

      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF232BED' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle' };
      });
      headerRow.height = 20;

      headers.forEach((h, i) => {
        let maxLen = h.length;
        for (const fila of excelRows) {
          const len = String(fila[i] ?? '').length;
          if (len > maxLen) maxLen = len;
        }
        ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 4, 12), 60);
      });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fecha = new Date().toISOString().slice(0, 10);
      a.download = `movimientos-fiduciarios-${fecha}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(`Error al exportar los movimientos: ${err.message}`);
    } finally {
      setExportando(false);
    }
  }

  const pagination = resultado?.pagination;
  const movimientos = resultado?.data || [];
  const fideicomisos = [...(resultado?.fideicomisos || [])].sort((a, b) => {
    const matchA = String(a).match(/^(\d{4,6})/);
    const matchB = String(b).match(/^(\d{4,6})/);
    const etapaA = matchA ? obtenerProyecto(matchA[1])?.etapa : null;
    const etapaB = matchB ? obtenerProyecto(matchB[1])?.etapa : null;
    if (etapaA != null && etapaB != null) return parseInt(etapaA, 10) - parseInt(etapaB, 10);
    if (etapaA != null) return -1;
    if (etapaB != null) return 1;
    const labelA = (matchA && descripcionProyecto(matchA[1])) || shortFideicomiso(a);
    const labelB = (matchB && descripcionProyecto(matchB[1])) || shortFideicomiso(b);
    return String(labelA).localeCompare(String(labelB), 'es');
  });
  const estados = resultado?.estados || [];
  const tiposMov = resultado?.tiposMovimiento || [];

  return (
    <div className={base.page}>
      <div className={base.header}>
        <div>
          <h1 className={base.title}>Movimientos fiduciarios</h1>
          <p className={base.subtitle}>
            Todos los movimientos de los encargos de Baía Kristal{pagination ? ` · ${pagination.total.toLocaleString('es-CO')} resultados` : ''}
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
            {(p) => <TextInput {...p} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Referencia, comprador, cédula, ID o nomenclatura…" />}
          </Field>
        </div>
        {fideicomisos.length > 0 && (
          <Field label="Proyecto / Fideicomiso">
            {(p) => (
              <MultiSelect
                {...p}
                options={fideicomisos.map((f) => {
                  const match = String(f).match(/^(\d{4,6})/);
                  const desc = match ? descripcionProyecto(match[1]) : null;
                  return { value: f, label: desc || shortFideicomiso(f) };
                })}
                value={fideicomisoFilter}
                onChange={setFideicomisoFilter}
                placeholder="Todos los proyectos"
              />
            )}
          </Field>
        )}
        {estados.length > 0 && (
          <Field label="Estado del negocio">
            {(p) => (
              <MultiSelect {...p} options={estados} value={estadoFilter} onChange={setEstadoFilter} placeholder="Todos los estados" />
            )}
          </Field>
        )}
        {tiposMov.length > 0 && (
          <Field label="Tipo de movimiento">
            {(p) => (
              <MultiSelect {...p} options={tiposMov} value={tipoMovFilter} onChange={setTipoMovFilter} placeholder="Todos los tipos" />
            )}
          </Field>
        )}
        <Field label="Fecha contable desde">
          {(p) => <TextInput {...p} type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setDatePreset(''); }} />}
        </Field>
        <Field label="Fecha contable hasta">
          {(p) => <TextInput {...p} type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setDatePreset(''); }} />}
        </Field>
        <div className={styles.presets}>
          <span className={styles.presetsTitulo}>Rango rápido</span>
          {PRESETS.map(({ label, months }) => (
            <button
              key={months}
              type="button"
              className={`${base.chip} ${datePreset === String(months) ? base.chipActivo : ''}`}
              onClick={() => {
                const now = new Date();
                const hasta = now.toISOString().slice(0, 10);
                const desde = new Date(now.getFullYear(), now.getMonth() - months, now.getDate()).toISOString().slice(0, 10);
                setFechaDesde(desde);
                setFechaHasta(hasta);
                setDatePreset(String(months));
              }}
            >
              {label}
            </button>
          ))}
        </div>
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
            <p className={base.vacioTexto}>{hasFilters ? 'Ajusta los filtros para ver resultados.' : 'Sincroniza los datos desde el módulo Negocios.'}</p>
          </div>
        ) : (
          <>
            <table className={base.table}>
              <thead>
                <tr>
                  <th className={styles.chevronCol} />
                  <th><span>Fecha<ConceptoHint columna="Fecha Contable" hoja="movimiento" /></span></th>
                  <th><span>Unidad<ConceptoHint columna="Nomenclatura" hoja="movimiento" /></span></th>
                  <th><span>Comprador<ConceptoHint columna="Propietario" hoja="movimiento" /></span></th>
                  <th><span>Referencia de recaudo</span></th>
                  <th><span>Tipo de movimiento<ConceptoHint columna="Tipo Movimiento" hoja="movimiento" /></span></th>
                  <th className={base.derecha}><span>Valor<ConceptoHint columna="Valor" hoja="movimiento" /></span></th>
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
