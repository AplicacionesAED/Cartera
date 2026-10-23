// Puerto de zoho-payment-tracker/frontend -- pagina "Cartera en Gestion"
// (CarteraMora.jsx). Backend: modules/dashboard/dashboard.service.js#
// obtenerCarteraMora (GET /negocios/cartera-mora) -- ya trae conteos/
// porRangoMora/resumen completos, este modulo es 100% de presentacion.
// Vive junto al StatTile del modulo Dashboard (../dashboard/) porque
// comparten backend y CSS de KPIs.
//
// "Antigüedad de la mora" es la grilla de tarjetas clicables del legado
// (label/count/monto, click filtra la tabla por ese rango) -- portada tal
// cual, no el OrdinalBarChart (ApexCharts) que usan los demas graficos de
// este dashboard.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { AlertTriangle, Search, Layers, MapPin, Building, X, Briefcase, Warehouse, ExternalLink, Clock, Repeat, Check, Download, Banknote, Percent, CheckCircle2 } from 'lucide-react';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { MultiSelect } from '../../components/ui/MultiSelect.jsx';
import { frentesDisponibles, torresDisponibles, podarSeleccion } from '../../utils/cascadaFiltros.js';
import { SortHeader } from '../../components/ui/SortHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { ariaSort } from '../../hooks/useSortableTable.js';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { getCarteraMora } from '../../api/dashboard.js';
import { updateFlagsNegocio } from '../../api/negocios.js';
import { formatCOP, formatDate } from '../../utils/format.js';
import { etiquetaEtapa } from '../../utils/etapas.js';
import { StatTile } from '../dashboard/StatTile.jsx';
import { CeldaDoble, ChipDias, BarraMora, ValorVencido } from './CarteraCeldas.jsx';
import dashStyles from '../dashboard/Dashboard.module.css';
import styles from './CarteraMoraPage.module.css';
import { rutaApp } from '../../utils/rutas.js';

// Misma paleta que dashboard/DashboardPage.jsx#COLOR_EXCEL -- mismo lenguaje
// visual para cualquier .xlsx que exporte este dashboard, Cartera incluida.
const COLOR_EXCEL = {
  headerFijaBg: 'FF1B21A6',
  headerTexto: 'FFFFFFFF',
  filaImparBg: 'FFF8FAFC',
  filaParBg: 'FFFFFFFF',
  textoPendiente: 'FFB45309',
  textoVencido: 'FFDC2626',
};

// Un builder compartido para las 2 vistas (inicial/contraentrega) -- misma
// filosofía que `ResumenPage.jsx#handleExportConsolidado`: el Excel es una
// foto fiel de lo que ya se ve en pantalla (mismas columnas, mismo color por
// tono que `tonoWarning`/`tonoDanger` en la tabla), no una re-derivación.
const EXCEL_COLUMNAS_INICIAL = [
  { key: 'etapa', header: 'ETAPA', width: 30, align: 'left', render: (f) => (f.etapa ? etiquetaEtapa(f.etapa) : '—') },
  { key: 'frenteTorre', header: 'FRENTE/TORRE', width: 20, align: 'left', render: (f) => f.frenteTorre || '—' },
  { key: 'unidad', header: 'UNIDAD', width: 16, align: 'left', render: (f) => f.unidad ?? '—' },
  { key: 'comprador', header: 'COMPRADOR', width: 32, align: 'left', render: (f) => f.comprador ?? '—' },
  { key: 'referencia', header: 'REFERENCIA', width: 16, align: 'left', render: (f) => f.referencia ?? '—' },
  { key: 'valorInmueble', header: 'VALOR APARTAMENTO', width: 20, numFmt: '#,##0', render: (f) => f.valorInmueble ?? 0 },
  { key: 'totalAbonado', header: 'VALOR ABONADO (CONCILIACIÓN)', width: 24, numFmt: '#,##0', render: (f) => f.totalAbonado ?? 0 },
  { key: 'cuotasEnMora', header: 'CUOTAS MORA', width: 14, numFmt: '#,##0', render: (f) => f.cuotasEnMora ?? 0 },
  { key: 'maxDiasAtraso', header: 'DÍAS ATRASO', width: 14, numFmt: '#,##0', tono: 'warning', render: (f) => f.maxDiasAtraso ?? 0 },
  { key: 'montoEnMora', header: 'VALOR VENCIDO', width: 20, numFmt: '#,##0', tono: 'danger', render: (f) => f.montoEnMora ?? 0 },
  { key: 'pctEnMora', header: '% EN MORA', width: 13, numFmt: '0.0"%"', tono: 'danger', render: (f) => f.pctEnMora ?? 0 },
];
const EXCEL_COLUMNAS_CONTRAENTREGA = [
  { key: 'etapa', header: 'ETAPA', width: 30, align: 'left', render: (f) => (f.etapa ? etiquetaEtapa(f.etapa) : '—') },
  { key: 'frenteTorre', header: 'FRENTE/TORRE', width: 20, align: 'left', render: (f) => f.frenteTorre || '—' },
  { key: 'unidad', header: 'UNIDAD', width: 16, align: 'left', render: (f) => f.unidad ?? '—' },
  { key: 'comprador', header: 'COMPRADOR', width: 32, align: 'left', render: (f) => f.comprador ?? '—' },
  { key: 'referencia', header: 'REFERENCIA', width: 16, align: 'left', render: (f) => f.referencia ?? '—' },
  { key: 'fechaSaldoContraentrega', header: 'FECHA VENCIDA', width: 16, isDate: true, tono: 'warning', render: (f) => (f.fechaSaldoContraentrega ? new Date(f.fechaSaldoContraentrega) : null) },
  { key: 'montoEnMora', header: 'VALOR PENDIENTE', width: 20, numFmt: '#,##0', tono: 'danger', render: (f) => f.montoEnMora ?? 0 },
];

function construirLibroCarteraMora(filas, columnas, nombreHoja) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  const fillSolida = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  columnas.forEach((col, i) => { ws.getColumn(i + 1).width = col.width; });

  const headerRow = ws.getRow(1);
  columnas.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.fill = fillSolida(COLOR_EXCEL.headerFijaBg);
    cell.font = { bold: true, color: { argb: COLOR_EXCEL.headerTexto }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: col.align === 'left' ? 'left' : 'center', wrapText: true };
  });
  headerRow.height = 22;

  filas.forEach((fila, idx) => {
    const row = ws.getRow(idx + 2);
    const bgFila = idx % 2 === 1 ? COLOR_EXCEL.filaImparBg : COLOR_EXCEL.filaParBg;
    columnas.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      cell.value = col.render(fila);
      if (col.numFmt) cell.numFmt = col.numFmt;
      if (col.isDate) cell.numFmt = 'dd/mm/yyyy';
      cell.alignment = { vertical: 'middle', horizontal: col.align === 'left' ? 'left' : 'center' };
      cell.fill = fillSolida(bgFila);
      if (col.tono === 'warning') cell.font = { color: { argb: COLOR_EXCEL.textoPendiente } };
      else if (col.tono === 'danger') cell.font = { color: { argb: COLOR_EXCEL.textoVencido } };
    });
  });

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return wb;
}

async function descargarLibroCarteraMora(wb, nombreArchivo) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtPct(v) {
  return v == null ? '—' : `${v.toFixed(1)}%`;
}

const LIMIT = 50;
// El orden principal de Cartera es por Etapa; es también al que se vuelve cuando el
// ciclo asc -> desc de cualquier columna se cierra (nunca queda "sin orden", que
// mostraba la lista por días de atraso).
const ORDEN_POR_DEFECTO = { key: 'etapa', direction: 'asc' };
const OPCIONES_TRAMITE = [
  { value: '', label: 'Todos' },
  { value: 'en_tramite', label: 'En trámite' },
  { value: 'no_en_tramite', label: 'No en trámite' },
  { value: 'canje', label: 'Canjes' },
];

// Misma regla que el backend (obtenerCarteraMora) -- se usa acá para saber,
// apenas se marca/desmarca un flag, si la fila debe seguir visible bajo el
// filtro de trámite actual sin esperar una respuesta del servidor.
function cumpleFiltroTramite(fila, tramite) {
  if (tramite === 'canje') return !!fila.esCanje;
  if (fila.esCanje) return false;
  if (tramite === 'en_tramite') return !!fila.enTramite;
  if (tramite === 'no_en_tramite') return !fila.enTramite;
  return true;
}

export function CarteraMoraPage() {
  const [filtros, setFiltros] = usePersistentState('cartera-mora:filtros', { search: '', etapa: [], frente: [], torre: [], tramite: '', vista: 'inicial', rango: '' });
  const [pagina, setPagina] = usePersistentState('cartera-mora:pagina', 1);

  // Enlaces desde Inicio (?vista=&rango=): aplican esos filtros una vez y limpian la URL.
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const vista = searchParams.get('vista');
    const rango = searchParams.get('rango');
    const buscar = searchParams.get('buscar');
    const tramite = searchParams.get('tramite');
    if (!vista && !rango && !buscar) return;
    setFiltros(() => ({ search: buscar ?? '', etapa: [], frente: [], torre: [], tramite: tramite ?? '', vista: vista === 'contraentrega' ? 'contraentrega' : 'inicial', rango: rango ?? '' }));
    setPagina(1);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sort, setSort] = usePersistentState('cartera-mora:sort-v3', ORDEN_POR_DEFECTO);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [menuContextual, setMenuContextual] = useState(null);

  // Contador compartido entre la carga normal y el refresco silencioso tras
  // marcar un flag -- varias peticiones pueden estar en vuelo a la vez y no
  // siempre responden en el mismo orden en que se pidieron.
  const ultimaPeticionRef = useRef(0);

  const cargar = useCallback(async (p, { silencioso = false } = {}) => {
    const miId = ++ultimaPeticionRef.current;
    if (!silencioso) setCargando(true);
    try {
      const res = await getCarteraMora({
        search: filtros.search || undefined,
        etapa: filtros.etapa || undefined,
        frente: filtros.frente || undefined,
        torre: filtros.torre || undefined,
        rango: filtros.rango || undefined,
        vista: filtros.vista,
        tramite: filtros.tramite || undefined,
        sortBy: sort.key ?? undefined,
        sortDir: sort.direction ?? undefined,
        page: p,
        limit: LIMIT,
      });
      if (miId !== ultimaPeticionRef.current) return;
      setResultado(res.data);
      setPagina(p);
      setError(null);
    } catch (err) {
      if (miId !== ultimaPeticionRef.current) return;
      setError(err.message);
    } finally {
      if (miId === ultimaPeticionRef.current && !silencioso) setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, sort]);

  useEffect(() => { cargar(1); }, [cargar]);

  useEffect(() => {
    if (!menuContextual) return;
    const cerrar = () => setMenuContextual(null);
    const cerrarConEscape = (e) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('click', cerrar);
    document.addEventListener('scroll', cerrar, true);
    document.addEventListener('keydown', cerrarConEscape);
    return () => {
      document.removeEventListener('click', cerrar);
      document.removeEventListener('scroll', cerrar, true);
      document.removeEventListener('keydown', cerrarConEscape);
    };
  }, [menuContextual]);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
    setPagina(1);
  }

  function actualizarCascada(campo, valor) {
    setFiltros((prev) => ({ ...prev, ...podarSeleccion(opciones, { etapa: prev.etapa, frente: prev.frente, torre: prev.torre, [campo]: valor }) }));
    setPagina(1);
  }

  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return ORDEN_POR_DEFECTO;
    });
  }

  // Clic en la fila abre el registro (negocio o, si no tiene negocio, el inmueble). Se ignora si el
  // clic fue sobre un enlace/botón o si el usuario estaba seleccionando texto.
  function abrirFila(e, fila) {
    if (e.target.closest('a, button, input, select')) return;
    if (window.getSelection()?.toString()) return;
    const destino = fila.negocioId ? `/negocios/inv-${fila.id}` : `/inventario/${fila.id}`;
    if (destino) navigate(destino);
  }

  function abrirMenuContextual(e, fila) {
    e.preventDefault();
    setMenuContextual({ x: e.clientX, y: e.clientY, fila });
  }

  // Marca/quita "en trámite" o "canje" desde el clic derecho -- actualización
  // optimista: la fila cambia (o desaparece, si deja de cumplir el filtro de
  // trámite actual) al toque. El PATCH real y el refresco de los KPIs/
  // contadores pasan de fondo (silencioso). Si algo falla, se recarga de
  // verdad para no quedar en un estado inconsistente.
  async function handleToggleFlag(fila, campo) {
    setMenuContextual(null);
    if (!fila.negocioId) return;
    const nuevoValor = !fila[campo];
    const filaActualizada = { ...fila, [campo]: nuevoValor };
    const siguesCumpliendo = cumpleFiltroTramite(filaActualizada, filtros.tramite);

    setResultado((prev) => {
      if (!prev) return prev;
      const data = siguesCumpliendo
        ? prev.data.map((f) => (f.id === fila.id ? filaActualizada : f))
        : prev.data.filter((f) => f.id !== fila.id);
      const pagination = siguesCumpliendo ? prev.pagination : { ...prev.pagination, total: Math.max(0, prev.pagination.total - 1) };
      return { ...prev, data, pagination };
    });

    try {
      await updateFlagsNegocio(fila.negocioId, { [campo]: nuevoValor });
      cargar(pagina, { silencioso: true });
    } catch (err) {
      cargar(pagina);
      if (err.status === 404) {
        window.alert('No se pudo actualizar: esta fila quedó desactualizada (probablemente se recargó la cartera desde Excel). Actualiza la página (F5) e intenta de nuevo.');
      } else {
        window.alert(`No se pudo actualizar el negocio: ${err.message}`);
      }
    }
  }

  async function handleExport() {
    setExportando(true);
    try {
      const res = await getCarteraMora({
        search: filtros.search || undefined,
        etapa: filtros.etapa || undefined,
        frente: filtros.frente || undefined,
        torre: filtros.torre || undefined,
        rango: filtros.rango || undefined,
        vista: filtros.vista,
        tramite: filtros.tramite || undefined,
        sortBy: sort.key ?? undefined,
        sortDir: sort.direction ?? undefined,
        page: 1,
        limit: 9999,
      });
      const filas = res.data.data.map((f) => ({ ...f, frenteTorre: [f.frente, f.torre].filter(Boolean).join(' / ') }));
      const columnas = filtros.vista === 'contraentrega' ? EXCEL_COLUMNAS_CONTRAENTREGA : EXCEL_COLUMNAS_INICIAL;
      const wb = construirLibroCarteraMora(filas, columnas, 'Cartera en Gestión');
      await descargarLibroCarteraMora(wb, `cartera-en-gestion-${filtros.vista}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      setError(err.message);
    } finally {
      setExportando(false);
    }
  }

  const meta = resultado ?? {};
  const resumen = meta.resumen ?? {};
  const porRangoMora = meta.porRangoMora ?? [];
  const conteos = meta.conteos ?? {};
  const maxMontoRango = Math.max(0, ...porRangoMora.map((r) => r.monto || 0));
  const frenteOptions = frentesDisponibles(opciones, filtros.etapa);
  const torreOptions = torresDisponibles(opciones, filtros.etapa, filtros.frente);
  const hasFilters = filtros.search || filtros.etapa.length || filtros.frente.length || filtros.torre.length || filtros.rango || filtros.tramite;

  function clearFilters() {
    setFiltros((prev) => ({ ...prev, search: '', etapa: [], frente: [], torre: [], rango: '', tramite: '' }));
    setPagina(1);
  }

  const esContraentrega = filtros.vista === 'contraentrega';

  return (
    <div className={dashStyles.page}>
      <div className={dashStyles.header}>
        <div className={dashStyles.headerText}>
          <h1 className={dashStyles.title}>Cartera en Gestión</h1>
          <p className={dashStyles.subtitle}>
            {esContraentrega
              ? 'Inmuebles cuyo Saldo Contraentrega ya venció — puede reflejar que aún no se ha escriturado, no necesariamente mora activa de cobranza.'
              : 'Negocios con cuotas atrasadas de la Cuota Inicial — no incluye Saldo Contraentrega, calculado en vivo contra los movimientos reales.'}
          </p>
        </div>
        <Button variant="secondary" onClick={handleExport} disabled={exportando || !resultado || meta.pagination?.total === 0}>
          <Download size={14} /> {exportando ? 'Exportando…' : 'Exportar a Excel'}
        </Button>
      </div>

      <Tabs
        ariaLabel="Vista de cartera"
        value={filtros.vista}
        onChange={(v) => setFiltros((prev) => ({ ...prev, vista: v, rango: '' }))}
        tabs={[
          { key: 'inicial', label: 'Cuota Inicial (mora activa)', badge: conteos.inicial ?? 0 },
          { key: 'contraentrega', label: 'Saldo Contraentrega vencido', badge: conteos.contraentrega ?? 0 },
        ]}
      />

      {error && <div className={dashStyles.formError}>{error}</div>}

      {!resultado ? (
        <p className={dashStyles.loadingState}>Cargando…</p>
      ) : (
        <>
          {esContraentrega ? (
            (resumen.negociosEnMora ?? 0) === 0 ? (
              <div className={`${styles.alertaContraentrega} ${styles.alertaOk}`}>
                <CheckCircle2 size={28} className={styles.alertaOkIcono} />
                <p>No hay inmuebles con Saldo Contraentrega vencido con los filtros actuales.</p>
              </div>
            ) : (
            <div className={styles.alertaContraentrega}>
              <AlertTriangle size={28} className={styles.alertaIcono} />
              <p>
                <b className={styles.alertaNumero}>{resumen.negociosEnMora}</b> inmuebles con Saldo Contraentrega vencido — suman{' '}
                <b className={styles.alertaNumero}>{formatCOP(resumen.totalMontoEnMora)}</b> pendientes. Hay que actualizar el plan de pagos de cada uno en Zoho.
              </p>
            </div>
            )
          ) : (
            <section>
              <div className={dashStyles.statsGrid}>
                <StatTile label="Negocios en mora" icon={Briefcase} tone="primary" value={resumen.negociosEnMora ?? 0} description="Negocios con al menos una cuota vencida de la Cuota Inicial." />
                <StatTile label="Cuotas en mora" icon={Layers} tone="neutral" value={resumen.totalCuotasEnMora ?? 0} description="Total de cuotas vencidas y no cubiertas por completo, sumando todos los negocios filtrados." />
                <StatTile label="Monto en mora" icon={Banknote} tone="warning" warning={(resumen.totalMontoEnMora ?? 0) > 0} value={formatCOP(resumen.totalMontoEnMora)} description="Suma del valor pendiente de todas las cuotas en mora." />
                <StatTile label="% mora del portafolio" icon={Percent} tone="neutral" value={fmtPct(resumen.pctMoraPortafolio)} description="Monto en mora sobre el total esperado a la fecha, para los negocios filtrados." />
              </div>
            </section>
          )}

          {!esContraentrega && porRangoMora.length > 0 && (
            <section className={styles.bloque}>
              <h2 className={styles.bloqueTitulo}>Antigüedad de la mora</h2>
              <p className={styles.bloqueSub}>Mismo criterio que las hojas de la fiduciaria. Haz clic en un rango para filtrar la tabla.</p>
              <div className={styles.rangoGrid}>
                {porRangoMora.map((r, i) => (
                  <button
                    key={r.rango}
                    type="button"
                    className={`${styles.rangoCard} ${filtros.rango === r.rango ? styles.rangoCardActiva : ''}`}
                    style={{ '--sev': porRangoMora.length > 1 ? (i / (porRangoMora.length - 1)) * 100 : 100 }}
                    onClick={() => actualizarFiltro('rango', filtros.rango === r.rango ? '' : r.rango)}
                  >
                    <p className={styles.rangoLabel}>{r.label}</p>
                    <p className={styles.rangoCount}>{r.count}</p>
                    <p className={styles.rangoMonto}>{formatCOP(r.monto)}</p>
                    <span className={styles.rangoPista}>
                      <span className={styles.rangoRelleno} style={{ width: `${maxMontoRango > 0 ? Math.max(4, (r.monto / maxMontoRango) * 100) : 0}%` }} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className={styles.detalle}>
            <div className={styles.toolbarCard}>
            <div className={styles.filtrosGrid}>
              <Field className={styles.campoBusqueda} label={<span className={styles.labelConIcono}><Search size={13} />Buscar</span>}>
                {(p) => <TextInput {...p} value={filtros.search} onChange={(e) => actualizarFiltro('search', e.target.value)} placeholder="Torre, comprador o referencia…" />}
              </Field>
              {(meta.etapasDisponibles?.length ?? 0) > 0 && (
                <Field className={styles.campoFiltro} label={<span className={styles.labelConIcono}><Layers size={13} />Etapa</span>}>
                  {(p) => (
                    <MultiSelect {...p} options={meta.etapasDisponibles.map((v) => ({ value: v, label: etiquetaEtapa(v) }))} value={filtros.etapa} onChange={(v) => actualizarCascada('etapa', v)} placeholder="Todas las etapas" />
                  )}
                </Field>
              )}
              {(meta.frentesDisponibles?.length ?? 0) > 0 && (
                <Field className={styles.campoFiltro} label={<span className={styles.labelConIcono}><MapPin size={13} />Frente</span>}>
                  {(p) => (
                    <MultiSelect {...p} options={frenteOptions} value={filtros.frente} onChange={(v) => actualizarCascada('frente', v)} placeholder="Todos los frentes" />
                  )}
                </Field>
              )}
              {filtros.frente.length > 0 && torreOptions.length > 0 && (
                <Field className={styles.campoFiltro} label={<span className={styles.labelConIcono}><Building size={13} />Torre</span>}>
                  {(p) => (
                    <MultiSelect {...p} options={torreOptions.map((v) => ({ value: v, label: `Torre ${v}` }))} value={filtros.torre} onChange={(v) => actualizarFiltro('torre', v)} placeholder="Todas las torres" />
                  )}
                </Field>
              )}
              {filtros.rango && (
                <div className={dashStyles.activeFilterBar}>
                  Rango: {porRangoMora.find((r) => r.rango === filtros.rango)?.label ?? filtros.rango}
                  <Button variant="ghost" onClick={() => actualizarFiltro('rango', '')}>Quitar</Button>
                </div>
              )}
              {hasFilters && (
                <button className={styles.limpiarFiltros} onClick={clearFilters}><X size={13} /> Limpiar filtros</button>
              )}
            </div>

            <div className={styles.tramiteRow}>
              <span className={styles.tramiteLabel}>Trámite / Canje</span>
              <div className={dashStyles.toggleGroup}>
              {OPCIONES_TRAMITE.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`${dashStyles.toggleButton} ${filtros.tramite === o.value ? dashStyles.toggleButtonActive : ''}`}
                  onClick={() => actualizarFiltro('tramite', o.value)}
                >
                  {o.label}
                </button>
              ))}
              </div>
            </div>
            </div>

            {cargando ? (
              <p className={dashStyles.loadingState}>Cargando…</p>
            ) : (
              <>
                <div className={styles.card}>
                <div className={styles.tableScroll}>
                  <table className={dashStyles.table}>
                    <thead>
                      {esContraentrega ? (
                        <tr>
                          <th aria-sort={ariaSort(sort, 'etapa')}><SortHeader label="Etapa" sortKey="etapa" sort={sort} onSort={toggleSort} /></th>
                          <th>Frente/Torre</th>
                          <th aria-sort={ariaSort(sort, 'unidad')}><SortHeader label="Nomenclatura" sortKey="unidad" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'comprador')}><SortHeader label="Comprador" sortKey="comprador" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'referencia')}><SortHeader label="Referencia" sortKey="referencia" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'fechaSaldoContraentrega')}><SortHeader label="Fecha vencida" sortKey="fechaSaldoContraentrega" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'montoEnMora')}><SortHeader label="Valor pendiente" sortKey="montoEnMora" sort={sort} onSort={toggleSort} align="center" /></th>
                        </tr>
                      ) : (
                        <tr>
                          <th aria-sort={ariaSort(sort, 'etapa')}><SortHeader label="Etapa" sortKey="etapa" sort={sort} onSort={toggleSort} /></th>
                          <th>Frente/Torre</th>
                          <th aria-sort={ariaSort(sort, 'unidad')}><SortHeader label="Nomenclatura" sortKey="unidad" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'comprador')}><SortHeader label="Comprador" sortKey="comprador" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'referencia')}><SortHeader label="Referencia" sortKey="referencia" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'valorInmueble')}><SortHeader label="Valor apartamento" sortKey="valorInmueble" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'totalAbonado')}><SortHeader label="Valor abonado" sortKey="totalAbonado" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'cuotasEnMora')}><SortHeader label="Cuotas mora" sortKey="cuotasEnMora" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'maxDiasAtraso')}><SortHeader label="Días atraso" sortKey="maxDiasAtraso" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'montoEnMora')}><SortHeader label="Valor vencido" sortKey="montoEnMora" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'pctEnMora')}><SortHeader label="% en mora" sortKey="pctEnMora" sort={sort} onSort={toggleSort} align="center" /></th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {(meta.data ?? []).length === 0 ? (
                        <tr><td colSpan={esContraentrega ? 7 : 11} className={styles.sinResultados}>Sin resultados.</td></tr>
                      ) : esContraentrega ? (
                        meta.data.map((f) => (
                          <tr key={f.id} onClick={(e) => abrirFila(e, f)} onContextMenu={(e) => abrirMenuContextual(e, f)} className={styles.filaCtxMenu}>
                            <td>{f.etapa ? etiquetaEtapa(f.etapa) : '—'}</td>
                            <td><CeldaDoble arriba={f.frente} abajo={f.torre != null ? `Torre ${f.torre}` : null} /></td>
                            <td>{f.unidad ?? '—'}</td>
                            <td className={styles.truncar} title={f.comprador ?? ''}>{f.comprador ?? '—'}</td>
                            <td>{f.referencia ?? '—'}</td>
                            <td className={`${styles.numCellCentro} ${styles.tonoWarning}`}>{formatDate(f.fechaSaldoContraentrega)}</td>
                            <td className={styles.numCellCentro}><ValorVencido valor={f.montoEnMora} /></td>
                          </tr>
                        ))
                      ) : (
                        meta.data.map((f) => (
                          <tr key={f.id} onClick={(e) => abrirFila(e, f)} onContextMenu={(e) => abrirMenuContextual(e, f)} className={styles.filaCtxMenu}>
                            <td>{f.etapa ? etiquetaEtapa(f.etapa) : '—'}</td>
                            <td><CeldaDoble arriba={f.frente} abajo={f.torre != null ? `Torre ${f.torre}` : null} /></td>
                            <td>{f.negocioId ? <Link to={`/negocios/inv-${f.id}`}>{f.unidad ?? f.id}</Link> : (f.unidad ?? '—')}</td>
                            <td className={styles.truncar} title={f.comprador ?? ''}>{f.comprador ?? '—'}</td>
                            <td>{f.referencia ?? '—'}</td>
                            <td className={styles.numCellCentro}>{f.valorInmueble != null ? formatCOP(f.valorInmueble) : '—'}</td>
                            <td className={styles.numCellCentro}>{f.totalAbonado != null ? formatCOP(f.totalAbonado) : '—'}</td>
                            <td className={styles.numCellCentro}>{f.cuotasEnMora}</td>
                            <td className={styles.numCellCentro}><ChipDias dias={f.maxDiasAtraso} /></td>
                            <td className={styles.numCellCentro}><ValorVencido valor={f.montoEnMora} /></td>
                            <td><BarraMora pct={f.pctEnMora} /></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {meta.pagination && (
                  <Pagination page={pagina} pageSize={meta.pagination.limit} total={meta.pagination.total} onPageChange={cargar} />
                )}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {menuContextual && (
        <div className={styles.contextMenu} style={{ top: menuContextual.y, left: menuContextual.x }} onClick={(e) => e.stopPropagation()}>
          <button
            className={styles.contextMenuItem}
            disabled={!menuContextual.fila.negocioId}
            onClick={() => { window.open(rutaApp(`/negocios/inv-${menuContextual.fila.id}`), '_blank'); setMenuContextual(null); }}
          >
            <Briefcase size={13} /> Ver negocio
          </button>
          <button className={styles.contextMenuItem} onClick={() => { window.open(rutaApp(`/inventario/${menuContextual.fila.id}`), '_blank'); setMenuContextual(null); }}>
            <Warehouse size={13} /> Ver inmueble
          </button>
          <button
            className={styles.contextMenuItem}
            disabled={!menuContextual.fila.opportunityId}
            onClick={() => { window.open(rutaApp(`/oportunidades/${menuContextual.fila.opportunityId}`), '_blank'); setMenuContextual(null); }}
          >
            <ExternalLink size={13} /> Ver oportunidad
          </button>
          <div className={styles.contextMenuSep} />
          <button
            className={styles.contextMenuItem}
            disabled={!menuContextual.fila.negocioId}
            onClick={() => handleToggleFlag(menuContextual.fila, 'enTramite')}
          >
            <Clock size={13} className={styles.iconoTramite} />
            {menuContextual.fila.enTramite ? 'Quitar en trámite' : 'Marcar en trámite'}
            {menuContextual.fila.enTramite && <Check size={13} className={styles.checkActivo} />}
          </button>
          <button
            className={styles.contextMenuItem}
            disabled={!menuContextual.fila.negocioId}
            onClick={() => handleToggleFlag(menuContextual.fila, 'esCanje')}
          >
            <Repeat size={13} className={styles.iconoCanje} />
            {menuContextual.fila.esCanje ? 'Quitar canje' : 'Marcar canje'}
            {menuContextual.fila.esCanje && <Check size={13} className={styles.checkActivo} />}
          </button>
        </div>
      )}
    </div>
  );
}
