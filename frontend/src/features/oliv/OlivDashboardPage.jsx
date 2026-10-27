// Dashboard: Plan de pagos vs. Recaudo -- Oliv (Jefe Gabriel, 2026-09-25:
// "vamos con el módulo Dashboard", mismo pedido "tal cual Baía Kristal" que
// motivó Resumen). Puerto de dashboard/DashboardPage.jsx -- backend YA
// existía completo (olivResumen.service.js#obtenerDashboardRecaudo, GET
// /oliv/resumen/dashboard-recaudo, construido para Resumen y reusado tal
// cual acá, mismo criterio que Baía Kristal comparte un solo endpoint entre
// Dashboard/Cartera en Gestión/Resumen) -- este módulo es 100% de
// presentación.
//
// Únicas 2 adaptaciones reales (mismas que Resumen): sin columnas Etapa/
// Frente (Oliv es un solo proyecto, solo Torre) y sin cascada de filtros --
// Torre + Estado del inmueble son planos e independientes.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, Fragment } from 'react';
import ExcelJS from 'exceljs';
import { Search, Building2, MapPin, X, Download, CalendarRange, Maximize2, Minimize2, History, Briefcase, Warehouse, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown, Wallet, Hourglass, AlertTriangle, TrendingUp } from 'lucide-react';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { MultiSelect } from '../../components/ui/MultiSelect.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { useEstadoRetorno } from '../../hooks/useEstadoRetorno.js';
import { useModoEnfocado } from '../../hooks/useModoEnfocado.js';
import { getDashboardRecaudoOliv } from '../../api/olivResumen.js';
import { formatCOP, formatDate } from '../../utils/format.js';
import { Checkbox } from '../../components/ui/Checkbox.jsx';
import { StatTile } from '../dashboard/StatTile.jsx';
import dashStyles from '../dashboard/Dashboard.module.css';
import styles from '../dashboard/DashboardPage.module.css';
import { rutaApp } from '../../utils/rutas.js';

function claveFila(fila) {
  return fila.unidad || fila.id;
}

function pendienteDe(fila) {
  return fila.valorInmueble != null && fila.totalAbonado != null ? Math.max(0, fila.valorInmueble - fila.totalAbonado) : null;
}

function filtrarRangoMeses(meses, desde, hasta) {
  return meses.filter((m) => (!desde || m >= desde) && (!hasta || m <= hasta));
}

const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function formatMesLabel(mes) {
  const [anio, mesNum] = mes.split('-');
  return `${MESES_ABREV[Number(mesNum) - 1]} ${anio}`;
}

function fuentePorMes(fila, alcancePlan) {
  if (alcancePlan === 'inicial') return fila.porMesInicial;
  if (alcancePlan === 'contraentrega') return fila.porMesContraentrega;
  return fila.porMes;
}

function ambosEnCero(fila, mes, alcancePlan) {
  const m = fuentePorMes(fila, alcancePlan)?.[mes];
  return (m?.esperado ?? 0) === 0 && (m?.recaudado ?? 0) === 0;
}

// Columnas fijas -- sin Etapa/Frente (Oliv es un solo proyecto, solo Torre).
const COLUMNAS_FIJAS = [
  { id: 'torre', header: 'Torre', width: 90, sortable: true, render: (f) => f.torre ?? '—' },
  { id: 'unidad', header: 'Unidad', width: 160, sortable: true, mono: true, render: (f) => f.unidad ?? '—' },
  { id: 'valorInmueble', header: 'Valor del inmueble', width: 150, sortable: true, align: 'right', render: (f) => formatCOP(f.valorInmueble) },
  { id: 'valorCuotaInicial', header: 'Valor cuota inicial', width: 170, sortable: true, align: 'right', render: (f) => formatCOP(f.valorCuotaInicial) },
  { id: 'abonadoCuotaInicial', header: 'Abonado cuota inicial', width: 190, sortable: true, align: 'right', tone: 'success', render: (f) => formatCOP(f.abonadoCuotaInicial) },
  { id: 'fechaSaldoContraentrega', header: 'Fecha saldo final', width: 150, sortable: true, render: (f) => formatDate(f.fechaSaldoContraentrega) },
  { id: 'valorSaldoContraentrega', header: 'Valor saldo final', width: 160, sortable: true, align: 'right', render: (f) => formatCOP(f.valorSaldoContraentrega) },
  { id: 'totalAbonado', header: 'Total abonado del inmueble', width: 200, sortable: true, align: 'right', tone: 'success', render: (f) => formatCOP(f.totalAbonado) },
  { id: 'pendienteRecaudar', header: 'Por recaudar', width: 180, sortable: true, align: 'right', tone: 'warning', render: (f) => formatCOP(pendienteDe(f)) },
  { id: 'cuotasEnMora', header: 'Cuotas vencidas (total)', width: 130, sortable: true, align: 'right', tone: 'danger', render: (f) => (f.cuotasEnMora ? f.cuotasEnMora : '—') },
  { id: 'montoEnMora', header: 'Valor cuotas vencidas (total)', width: 190, sortable: true, align: 'right', tone: 'danger', render: (f) => (f.montoEnMora ? formatCOP(f.montoEnMora) : '—') },
];
const COLUMNAS_STICKY_IDS = ['torre', 'unidad'];
const STICKY_LEFT_ESTIMADO = (() => {
  const mapa = {};
  let acumulado = 0;
  for (const id of COLUMNAS_STICKY_IDS) {
    mapa[id] = acumulado;
    acumulado += COLUMNAS_FIJAS.find((c) => c.id === id).width;
  }
  return mapa;
})();
const ANCHO_MES_SUBCOL = 120;

const COLOR_EXCEL = {
  headerFijaBg: 'FF1B21A6',
  headerTexto: 'FFFFFFFF',
  celdaFijaBg: 'FFE4E6F7',
  bordeFuerte: 'FF141969',
  headerMesImparBg: 'FFF1F5F9',
  headerMesParBg: 'FFF8FAFC',
  celdaMesImparBg: 'FFF8FAFC',
  celdaMesParBg: 'FFFFFFFF',
  textoHeaderMes: 'FF64748B',
  resaltadaBg: 'FFFEF3C7',
  bordeSuave: 'FFE2E8F0',
  textoRecaudado: 'FF047857',
  textoPendiente: 'FFB45309',
  textoVencido: 'FFDC2626',
  textoTotalLabel: 'FF475569',
};

export function OlivDashboardPage() {
  const [filtros, setFiltros] = useEstadoRetorno('oliv-dashboard-recaudo:filtros', {
    search: '', torre: [], estadoInmueble: [], conMovimientos: false, mesDesde: '', mesHasta: '',
  });
  const [vistaMeses, setVistaMeses] = useEstadoRetorno('oliv-dashboard-recaudo:vista', 'ambos');
  const [alcancePlan, setAlcancePlan] = useEstadoRetorno('oliv-dashboard-recaudo:plan', 'ambos');
  const [pagina, setPagina] = useEstadoRetorno('oliv-dashboard-recaudo:pagina', 1);
  const [sort, setSort] = useEstadoRetorno('oliv-dashboard-recaudo:sort', { key: null, direction: null });
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [filasResaltadas, setFilasResaltadas] = useState(() => new Set());
  const [menuContextual, setMenuContextual] = useState(null);
  const [enfocado, toggleEnfocado] = useModoEnfocado();

  useEffect(() => {
    setCargando(true);
    setError(null);
    getDashboardRecaudoOliv({
      search: filtros.search || undefined,
      torre: filtros.torre || undefined,
      estadoInmueble: filtros.estadoInmueble || undefined,
      conMovimientos: filtros.conMovimientos ? 'true' : undefined,
      sortBy: sort.key ?? undefined,
      sortDir: sort.direction ?? undefined,
      page: pagina,
      limit: 50,
    })
      .then((res) => setResultado(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [filtros, pagina, sort]);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
    setPagina(1);
  }

  function handleSort(campo) {
    setSort((prev) => {
      if (prev.key !== campo) return { key: campo, direction: 'asc' };
      if (prev.direction === 'asc') return { key: campo, direction: 'desc' };
      return { key: null, direction: null };
    });
  }

  const toggleResaltado = useCallback((clave) => {
    setFilasResaltadas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  }, []);

  function abrirMenuContextual(e, fila) {
    e.preventDefault();
    setMenuContextual({ x: e.clientX, y: e.clientY, fila });
  }

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

  const meta = resultado ?? {};
  const meses = meta.meses ?? [];
  const mesesFiltrados = filtrarRangoMeses(meses, filtros.mesDesde, filtros.mesHasta);
  const totalesActivos = alcancePlan === 'inicial' ? meta.totalesInicial : alcancePlan === 'contraentrega' ? meta.totalesContraentrega : meta.totales;
  const hasFilters = filtros.search || filtros.torre.length || filtros.estadoInmueble.length || filtros.conMovimientos
    || filtros.mesDesde || filtros.mesHasta || vistaMeses !== 'ambos' || alcancePlan !== 'ambos';

  function clearFilters() {
    setFiltros({ search: '', torre: [], estadoInmueble: [], conMovimientos: false, mesDesde: '', mesHasta: '' });
    setVistaMeses('ambos');
    setAlcancePlan('ambos');
    setPagina(1);
  }

  async function handleExport() {
    setExportando(true);
    try {
      const res = await getDashboardRecaudoOliv({
        search: filtros.search || undefined,
        torre: filtros.torre || undefined,
        estadoInmueble: filtros.estadoInmueble || undefined,
        conMovimientos: filtros.conMovimientos ? 'true' : undefined,
        sortBy: sort.key ?? undefined,
        sortDir: sort.direction ?? undefined,
        page: 1,
        limit: 9999,
      });
      const payload = res.data;
      const mesesExport = filtrarRangoMeses(payload.meses, filtros.mesDesde, filtros.mesHasta);

      const colsMeses = [];
      mesesExport.forEach((mes, mesIdx) => {
        if (vistaMeses !== 'recaudado') colsMeses.push({ mes, tipo: 'esperado', mesIdx });
        if (vistaMeses !== 'esperado') colsMeses.push({ mes, tipo: 'recaudado', mesIdx });
        colsMeses.push({ mes, tipo: 'porRecaudar', mesIdx });
      });

      const FIJAS = COLUMNAS_FIJAS.map((c) => ({ header: c.header, key: c.id, width: Math.max(10, Math.round(c.width / 8)) }));

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Dashboard');

      FIJAS.forEach((f, i) => { ws.getColumn(i + 1).width = f.width; });
      colsMeses.forEach((_, i) => { ws.getColumn(FIJAS.length + i + 1).width = 15; });

      const fillSolida = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
      const bordeIzq = { left: { style: 'thin', color: { argb: COLOR_EXCEL.bordeSuave } } };
      const bordeDerFuerte = { right: { style: 'medium', color: { argb: COLOR_EXCEL.bordeFuerte } } };

      const headerRow1 = ws.getRow(1);
      const headerRow2 = ws.getRow(2);

      FIJAS.forEach((f, i) => {
        const col = i + 1;
        ws.mergeCells(1, col, 2, col);
        const cell = headerRow1.getCell(col);
        cell.value = f.header.toUpperCase();
        cell.fill = fillSolida(COLOR_EXCEL.headerFijaBg);
        cell.font = { bold: true, color: { argb: COLOR_EXCEL.headerTexto }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        if (f.key === 'montoEnMora') cell.border = bordeDerFuerte;
      });

      let cursor = FIJAS.length + 1;
      mesesExport.forEach((mes, mesIdx) => {
        const hijas = colsMeses.filter((c) => c.mesIdx === mesIdx);
        const inicio = cursor;
        const fin = cursor + hijas.length - 1;
        const esImpar = mesIdx % 2 === 1;
        const bgHeader = esImpar ? COLOR_EXCEL.headerMesImparBg : COLOR_EXCEL.headerMesParBg;

        if (fin > inicio) ws.mergeCells(1, inicio, 1, fin);
        const cellMes = headerRow1.getCell(inicio);
        cellMes.value = formatMesLabel(mes).toUpperCase();
        cellMes.fill = fillSolida(bgHeader);
        cellMes.font = { bold: true, color: { argb: COLOR_EXCEL.textoHeaderMes }, size: 11 };
        cellMes.alignment = { vertical: 'middle', horizontal: 'left' };
        if (mesIdx > 0) cellMes.border = bordeIzq;

        hijas.forEach((h, j) => {
          const col = inicio + j;
          const cell = headerRow2.getCell(col);
          cell.value = h.tipo === 'esperado' ? 'PROYECTADO' : h.tipo === 'recaudado' ? 'RECAUDADO' : 'POR RECAUDAR';
          cell.fill = fillSolida(bgHeader);
          cell.font = { bold: true, color: { argb: COLOR_EXCEL.textoHeaderMes }, size: 10 };
          if (j === 0 && mesIdx > 0) cell.border = bordeIzq;
        });

        cursor = fin + 1;
      });
      headerRow1.height = 20;
      headerRow2.height = 16;

      let rowNum = 3;
      for (const n of payload.data) {
        const row = ws.getRow(rowNum);
        const resaltada = filasResaltadas.has(claveFila(n));
        const bgFija = resaltada ? COLOR_EXCEL.resaltadaBg : COLOR_EXCEL.celdaFijaBg;

        FIJAS.forEach((f, i) => {
          const col = i + 1;
          const cell = row.getCell(col);
          if (f.key === 'fechaSaldoContraentrega') {
            cell.value = n[f.key] ? new Date(n[f.key]) : null;
            cell.numFmt = 'dd/mm/yyyy';
          } else if (f.key === 'torre' || f.key === 'unidad') {
            cell.value = n[f.key] ?? '';
          } else if (f.key === 'pendienteRecaudar') {
            cell.value = pendienteDe(n) ?? 0;
            cell.numFmt = '#,##0';
            cell.font = { color: { argb: COLOR_EXCEL.textoPendiente } };
          } else if (f.key === 'cuotasEnMora') {
            cell.value = n.cuotasEnMora ?? 0;
            cell.font = { color: { argb: COLOR_EXCEL.textoVencido } };
          } else if (f.key === 'montoEnMora') {
            cell.value = n.montoEnMora ?? 0;
            cell.numFmt = '#,##0';
            cell.font = { color: { argb: COLOR_EXCEL.textoVencido } };
          } else if (['valorInmueble', 'valorSaldoContraentrega', 'totalAbonado', 'valorCuotaInicial', 'abonadoCuotaInicial'].includes(f.key)) {
            cell.value = n[f.key] ?? 0;
            cell.numFmt = '#,##0';
            if (f.key === 'totalAbonado' || f.key === 'abonadoCuotaInicial') cell.font = { color: { argb: COLOR_EXCEL.textoRecaudado } };
          } else {
            cell.value = n[f.key] ?? '';
          }
          cell.fill = fillSolida(bgFija);
          if (f.key === 'montoEnMora') cell.border = bordeDerFuerte;
        });

        colsMeses.forEach((c, j) => {
          const col = FIJAS.length + j + 1;
          const cell = row.getCell(col);
          const valorMes = fuentePorMes(n, alcancePlan)?.[c.mes]?.[c.tipo] ?? 0;
          cell.value = valorMes;
          cell.numFmt = '#,##0';
          if (c.tipo === 'recaudado') cell.font = { color: { argb: COLOR_EXCEL.textoRecaudado } };
          else if (c.tipo === 'porRecaudar') cell.font = { color: { argb: COLOR_EXCEL.textoPendiente } };
          const esImpar = c.mesIdx % 2 === 1;
          cell.fill = fillSolida(resaltada ? COLOR_EXCEL.resaltadaBg : (esImpar ? COLOR_EXCEL.celdaMesImparBg : COLOR_EXCEL.celdaMesParBg));
          const esInicioMes = j === 0 || colsMeses[j - 1].mesIdx !== c.mesIdx;
          if (esInicioMes && c.mesIdx > 0) cell.border = bordeIzq;
        });
        rowNum++;
      }

      if (mesesExport.length > 0) {
        const totalRow = ws.getRow(rowNum);
        ws.mergeCells(rowNum, 1, rowNum, 2);
        const bordeArriba = { top: { style: 'medium', color: { argb: COLOR_EXCEL.bordeSuave } } };

        const labelCell = totalRow.getCell(1);
        labelCell.value = 'Total del portafolio filtrado';
        labelCell.font = { bold: true, color: { argb: COLOR_EXCEL.textoTotalLabel } };
        labelCell.fill = fillSolida(COLOR_EXCEL.celdaMesImparBg);
        labelCell.border = bordeArriba;

        const totalesFijos = payload.totalesColumnasFijas || {};
        const colorPorClave = {
          totalAbonado: COLOR_EXCEL.textoRecaudado,
          abonadoCuotaInicial: COLOR_EXCEL.textoRecaudado,
          pendienteRecaudar: COLOR_EXCEL.textoPendiente,
          cuotasEnMora: COLOR_EXCEL.textoVencido,
          montoEnMora: COLOR_EXCEL.textoVencido,
        };
        FIJAS.forEach((f, i) => {
          if (i < 2) return;
          const cell = totalRow.getCell(i + 1);
          cell.fill = fillSolida(COLOR_EXCEL.celdaMesImparBg);
          cell.border = bordeArriba;
          if (f.key === 'fechaSaldoContraentrega') return;
          cell.value = totalesFijos[f.key] ?? 0;
          cell.numFmt = '#,##0';
          cell.font = { bold: true, color: { argb: colorPorClave[f.key] ?? COLOR_EXCEL.textoTotalLabel } };
        });

        const totalesExport = alcancePlan === 'inicial' ? payload.totalesInicial : alcancePlan === 'contraentrega' ? payload.totalesContraentrega : payload.totales;
        colsMeses.forEach((c, j) => {
          const col = FIJAS.length + j + 1;
          const cell = totalRow.getCell(col);
          cell.value = totalesExport[c.mes]?.[c.tipo] ?? 0;
          cell.numFmt = '#,##0';
          cell.font = {
            bold: true,
            color: { argb: c.tipo === 'recaudado' ? COLOR_EXCEL.textoRecaudado : c.tipo === 'porRecaudar' ? COLOR_EXCEL.textoPendiente : COLOR_EXCEL.textoTotalLabel },
          };
          cell.fill = fillSolida(COLOR_EXCEL.celdaMesImparBg);
          cell.border = bordeArriba;
        });
      }

      ws.views = [{ state: 'frozen', xSplit: FIJAS.length, ySplit: 2 }];

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const sufijoAlcance = alcancePlan === 'inicial' ? '-30pct' : alcancePlan === 'contraentrega' ? '-70pct' : '';
      a.href = url;
      a.download = `dashboard-oliv-plan-vs-recaudo${sufijoAlcance}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExportando(false);
    }
  }

  const [filtrosAvanzados, setFiltrosAvanzados] = useState(false);

  return (
    <div className={enfocado ? styles.enfocado : styles.page}>
      <div className={dashStyles.header}>
        <div className={dashStyles.headerText}>
          <h1 className={dashStyles.title}>Dashboard: Plan de pagos vs. Recaudo</h1>
          <p className={dashStyles.subtitle}>Oliv · Drill-down por inmueble, mes a mes.</p>
        </div>
        <div className={styles.headerActions}>
          {filasResaltadas.size > 0 && (
            <button className={styles.limpiarResaltado} onClick={() => setFilasResaltadas(new Set())}>
              <X size={13} /> Quitar resaltado ({filasResaltadas.size})
            </button>
          )}
          <Button variant="secondary" onClick={toggleEnfocado}>
            {enfocado ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {enfocado ? 'Salir de pantalla completa' : 'Pantalla completa'}
          </Button>
          <Button variant="secondary" onClick={handleExport} disabled={exportando || !resultado || meta.pagination?.total === 0}>
            <Download size={14} /> {exportando ? 'Exportando…' : 'Exportar a Excel'}
          </Button>
        </div>
      </div>

      {error && <div className={dashStyles.formError}>{error}</div>}

      <div className={styles.toolbarCard}>
        <div className={styles.filtrosGrid}>
        <Field className={styles.campoBusqueda} label={<span className={styles.labelConIcono}><Search size={13} />Buscar</span>}>
          {(p) => <TextInput {...p} value={filtros.search} onChange={(e) => actualizarFiltro('search', e.target.value)} placeholder="Unidad, referencia o comprador…" />}
        </Field>
        {(meta.torresDisponibles?.length ?? 0) > 0 && (
          <Field className={styles.campoFiltro} label={<span className={styles.labelConIcono}><Building2 size={13} />Torre</span>}>
            {(p) => (
              <MultiSelect {...p} options={meta.torresDisponibles} value={filtros.torre} onChange={(v) => actualizarFiltro('torre', v)} placeholder="Todas las torres" />
            )}
          </Field>
        )}
        {(meta.estadosInmuebleDisponibles?.length ?? 0) > 0 && (
          <Field className={styles.campoFiltro} label={<span className={styles.labelConIcono}><MapPin size={13} />Estado del inmueble</span>}>
            {(p) => (
              <MultiSelect {...p} options={meta.estadosInmuebleDisponibles} value={filtros.estadoInmueble} onChange={(v) => actualizarFiltro('estadoInmueble', v)} placeholder="Todos los estados" />
            )}
          </Field>
        )}
        <button type="button" className={styles.masFiltros} onClick={() => setFiltrosAvanzados((v) => !v)} aria-expanded={filtrosAvanzados} title="Fechas, vista (ambos, proyectado, recaudado) y plan (30% / 70%)">
          {filtrosAvanzados ? 'Menos filtros' : 'Más filtros'}
        </button>
        </div>
        {filtrosAvanzados && (
        <div className={styles.controlesFila}>
        {meses.length > 0 && (
          <Field className={styles.campoFiltro} label={<span className={styles.labelConIcono}><CalendarRange size={13} />Desde</span>}>
            {(p) => (
              <TextInput {...p} type="month" value={filtros.mesDesde} min={meses[0]} max={filtros.mesHasta || meses[meses.length - 1]}
                onChange={(e) => actualizarFiltro('mesDesde', e.target.value)} />
            )}
          </Field>
        )}
        {meses.length > 0 && (
          <Field className={styles.campoFiltro} label={<span className={styles.labelConIcono}><CalendarRange size={13} />Hasta</span>}>
            {(p) => (
              <TextInput {...p} type="month" value={filtros.mesHasta} min={filtros.mesDesde || meses[0]} max={meses[meses.length - 1]}
                onChange={(e) => actualizarFiltro('mesHasta', e.target.value)} />
            )}
          </Field>
        )}
        <div className={styles.filtroLabelWrap}>
          <span className={styles.filtroLabel}>Ver</span>
          <div className={dashStyles.toggleGroup}>
            {[{ v: 'ambos', l: 'Ambos' }, { v: 'esperado', l: 'Proyectado' }, { v: 'recaudado', l: 'Recaudado' }].map(({ v, l }) => (
              <button key={v} type="button" className={`${dashStyles.toggleButton} ${vistaMeses === v ? dashStyles.toggleButtonActive : ''}`} onClick={() => setVistaMeses(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className={styles.filtroLabelWrap}>
          <span className={styles.filtroLabel}>Plan</span>
          <div className={dashStyles.toggleGroup}>
            {[{ v: 'ambos', l: 'Ambos (100%)' }, { v: 'inicial', l: 'Cuota inicial (30%)' }, { v: 'contraentrega', l: 'Saldo final (70%)' }].map(({ v, l }) => (
              <button key={v} type="button" className={`${dashStyles.toggleButton} ${alcancePlan === v ? dashStyles.toggleButtonActive : ''}`} onClick={() => setAlcancePlan(v)}>{l}</button>
            ))}
          </div>
        </div>
        <Checkbox label="Solo con movimientos" checked={Boolean(filtros.conMovimientos)} onChange={(e) => actualizarFiltro('conMovimientos', e.target.checked)} />
        {hasFilters && (
          <button className={styles.limpiarFiltros} onClick={clearFilters}>
            <X size={13} /> Limpiar filtros
          </button>
        )}
        </div>
        )}
      </div>

      {meses.length > 0 && mesesFiltrados.length === 0 && (
        <p className={styles.avisoRango}>No hay meses en el rango seleccionado — ajusta Desde/Hasta.</p>
      )}

      {meta.totalesColumnasFijas && !cargando && !enfocado && (
        <div className={`${dashStyles.statsGrid}`}>
          <StatTile label="Valor del portafolio filtrado" value={formatCOP(meta.totalesColumnasFijas.valorInmueble ?? 0)} icon={Building2} tone="primary" />
          <StatTile label="Total abonado" value={formatCOP(meta.totalesColumnasFijas.totalAbonado ?? 0)} icon={Wallet} tone="success" />
          <StatTile label="Por recaudar" value={formatCOP(meta.totalesColumnasFijas.pendienteRecaudar ?? 0)} icon={Hourglass} tone="neutral" />
          <StatTile label="Valor proyectado" value={formatCOP((meta.totalesColumnasFijas.totalAbonado ?? 0) + (meta.totalesColumnasFijas.pendienteRecaudar ?? 0))} icon={TrendingUp} tone="primary" />
          <StatTile label={`En mora (${meta.totalesColumnasFijas.cuotasEnMora ?? 0} cuotas)`} value={formatCOP(meta.totalesColumnasFijas.montoEnMora ?? 0)} icon={AlertTriangle} tone="warning" warning={(meta.totalesColumnasFijas.montoEnMora ?? 0) > 0} />
        </div>
      )}

      <div className={styles.card}>
        {cargando ? (
          <p className={dashStyles.loadingState}>Cargando…</p>
        ) : (
          <TablaDashboardOliv
            filas={meta.data ?? []}
            mesesFiltrados={mesesFiltrados}
            vistaMeses={vistaMeses}
            alcancePlan={alcancePlan}
            totales={totalesActivos ?? {}}
            totalesColumnasFijas={meta.totalesColumnasFijas}
            filasResaltadas={filasResaltadas}
            toggleResaltado={toggleResaltado}
            abrirMenuContextual={abrirMenuContextual}
            sort={sort}
            onSort={handleSort}
          />
        )}

        {meta.pagination && (
          <Pagination page={pagina} pageSize={meta.pagination.limit} total={meta.pagination.total} onPageChange={setPagina} />
        )}
      </div>

      {menuContextual && (
        <div className={styles.contextMenu} style={{ top: menuContextual.y, left: menuContextual.x }} onClick={(e) => e.stopPropagation()}>
          <button
            className={styles.contextMenuItem}
            onClick={() => { window.open(rutaApp(`/oliv/negocios/${menuContextual.fila.id}`), '_blank'); setMenuContextual(null); }}
          >
            <Briefcase size={13} /> Ver negocio
          </button>
          <button
            className={styles.contextMenuItem}
            disabled={!menuContextual.fila.inmuebleId}
            onClick={() => { window.open(rutaApp(`/oliv/inmuebles/${menuContextual.fila.inmuebleId}`), '_blank'); setMenuContextual(null); }}
          >
            <Warehouse size={13} /> Ver inmueble
          </button>
          <button
            className={styles.contextMenuItem}
            disabled={!menuContextual.fila.oportunidadId}
            onClick={() => { window.open(rutaApp(`/oliv/oportunidades/${menuContextual.fila.oportunidadId}`), '_blank'); setMenuContextual(null); }}
          >
            <ExternalLink size={13} /> Ver oportunidad
          </button>
        </div>
      )}
    </div>
  );
}

function TablaDashboardOliv({ filas, mesesFiltrados, vistaMeses, alcancePlan, totales, totalesColumnasFijas, filasResaltadas, toggleResaltado, abrirMenuContextual, sort, onSort }) {
  const scrollRef = useRef(null);
  const stickyRefs = useRef({});
  const [stickyLefts, setStickyLefts] = useState(() => ({ ...STICKY_LEFT_ESTIMADO }));

  useLayoutEffect(() => {
    let acumulado = 0;
    const next = {};
    for (const id of COLUMNAS_STICKY_IDS) {
      next[id] = acumulado;
      const el = stickyRefs.current[id];
      acumulado += el ? el.getBoundingClientRect().width : COLUMNAS_FIJAS.find((c) => c.id === id).width;
    }
    setStickyLefts(next);
  }, [filas, mesesFiltrados, vistaMeses]);

  return (
    <div className={styles.tableScroll} ref={scrollRef} data-lenis-prevent>
      <table className={styles.megaTable}>
        <colgroup>
          {COLUMNAS_FIJAS.map((c) => <col key={c.id} style={{ width: c.width }} />)}
          {mesesFiltrados.map((mes) => {
            const n = (vistaMeses === 'ambos' ? 2 : 1) + 1;
            return Array.from({ length: n }, (_, i) => <col key={`${mes}-${i}`} style={{ width: ANCHO_MES_SUBCOL }} />);
          })}
        </colgroup>
        <thead>
          <tr>
            {COLUMNAS_FIJAS.map((col) => {
              const esSticky = COLUMNAS_STICKY_IDS.includes(col.id);
              const activo = sort.key === col.id;
              const Icono = activo ? (sort.direction === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
              return (
                <th
                  key={col.id}
                  ref={esSticky ? (el) => { if (el) stickyRefs.current[col.id] = el; } : undefined}
                  rowSpan={2}
                  className={`${styles.thFija} ${esSticky ? styles.sticky : ''} ${col.id === 'montoEnMora' ? styles.bordeDerFuerte : ''}`}
                  style={esSticky ? { left: stickyLefts[col.id] } : undefined}
                  onClick={col.sortable ? () => onSort(col.id) : undefined}
                >
                  <span className={styles.thFijaContenido}>
                    {col.header}
                    {col.sortable && <Icono size={12} className={activo ? styles.iconoActivo : styles.iconoInactivo} />}
                  </span>
                </th>
              );
            })}
            {mesesFiltrados.map((mes, mesIdx) => {
              const nSub = (vistaMeses === 'ambos' ? 2 : 1) + 1;
              return (
                <th
                  key={mes}
                  colSpan={nSub}
                  className={`${styles.thMesGrupo} ${mesIdx % 2 === 1 ? styles.thMesImpar : ''} ${mesIdx > 0 ? styles.bordeMes : ''}`}
                >
                  {formatMesLabel(mes)}
                </th>
              );
            })}
          </tr>
          <tr>
            {mesesFiltrados.map((mes, mesIdx) => (
              <Fragment key={mes}>
                {vistaMeses !== 'recaudado' && <th className={`${styles.thMes} ${mesIdx % 2 === 1 ? styles.thMesImpar : ''} ${mesIdx > 0 ? styles.bordeMes : ''}`}>Proyectado</th>}
                {vistaMeses !== 'esperado' && <th className={`${styles.thMes} ${mesIdx % 2 === 1 ? styles.thMesImpar : ''} ${vistaMeses === 'recaudado' && mesIdx > 0 ? styles.bordeMes : ''}`}>Recaudado</th>}
                <th className={`${styles.thMes} ${mesIdx % 2 === 1 ? styles.thMesImpar : ''}`}>Por recaudar</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        {mesesFiltrados.length > 0 && (
          <tfoot>
            <tr className={styles.filaTotal}>
              <td colSpan={2} className={`${styles.sticky} ${styles.totalLabel}`} style={{ left: 0 }}>Total del portafolio filtrado</td>
              <td className={styles.numCell}>{formatCOP(totalesColumnasFijas?.valorInmueble ?? 0)}</td>
              <td className={styles.numCell}>{formatCOP(totalesColumnasFijas?.valorCuotaInicial ?? 0)}</td>
              <td className={`${styles.numCell} ${styles['tono-success']}`}>{formatCOP(totalesColumnasFijas?.abonadoCuotaInicial ?? 0)}</td>
              <td />
              <td className={styles.numCell}>{formatCOP(totalesColumnasFijas?.valorSaldoContraentrega ?? 0)}</td>
              <td className={`${styles.numCell} ${styles['tono-success']}`}>{formatCOP(totalesColumnasFijas?.totalAbonado ?? 0)}</td>
              <td className={`${styles.numCell} ${styles['tono-warning']}`}>{formatCOP(totalesColumnasFijas?.pendienteRecaudar ?? 0)}</td>
              <td className={`${styles.numCell} ${styles['tono-danger']}`}>{totalesColumnasFijas?.cuotasEnMora ?? 0}</td>
              <td className={`${styles.numCell} ${styles['tono-danger']}`}>{formatCOP(totalesColumnasFijas?.montoEnMora ?? 0)}</td>
              {mesesFiltrados.map((mes) => (
                <Fragment key={mes}>
                  {vistaMeses !== 'recaudado' && <td className={styles.numCell}>{formatCOP(totales[mes]?.esperado ?? 0)}</td>}
                  {vistaMeses !== 'esperado' && <td className={`${styles.numCell} ${styles['tono-success']}`}>{formatCOP(totales[mes]?.recaudado ?? 0)}</td>}
                  <td className={`${styles.numCell} ${styles['tono-warning']}`}>{formatCOP(totales[mes]?.porRecaudar ?? 0)}</td>
                </Fragment>
              ))}
            </tr>
          </tfoot>
        )}
        <tbody>
          {filas.length === 0 ? (
            <tr><td colSpan={COLUMNAS_FIJAS.length + mesesFiltrados.length * 3} className={styles.sinResultados}>Sin resultados.</td></tr>
          ) : (
            filas.map((fila) => {
              const clave = claveFila(fila);
              const resaltada = filasResaltadas.has(clave);
              return (
                <tr
                  key={fila.id}
                  className={`${styles.fila} ${resaltada ? styles.filaResaltada : ''}`}
                  onClick={() => toggleResaltado(clave)}
                  onContextMenu={(e) => abrirMenuContextual(e, fila)}
                >
                  {COLUMNAS_FIJAS.map((col) => {
                    const esSticky = COLUMNAS_STICKY_IDS.includes(col.id);
                    return (
                      <td
                        key={col.id}
                        className={`${col.align === 'right' ? styles.numCell : ''} ${col.mono ? styles.monoCell : ''} ${col.tone ? styles[`tono-${col.tone}`] : ''} ${esSticky ? styles.sticky : ''} ${col.id === 'montoEnMora' ? styles.bordeDerFuerte : ''}`}
                        style={esSticky ? { left: stickyLefts[col.id] } : undefined}
                      >
                        {col.render(fila)}
                      </td>
                    );
                  })}
                  {mesesFiltrados.map((mes, mesIdx) => {
                    const vacio = ambosEnCero(fila, mes, alcancePlan);
                    const valores = fuentePorMes(fila, alcancePlan)?.[mes];
                    return (
                      <Fragment key={mes}>
                        {vistaMeses !== 'recaudado' && (
                          <td className={`${styles.numCell} ${mesIdx % 2 === 1 ? styles.celdaMesImpar : ''} ${mesIdx > 0 ? styles.bordeMes : ''}`}>
                            {vacio ? null : formatCOP(valores?.esperado ?? 0)}
                          </td>
                        )}
                        {vistaMeses !== 'esperado' && (
                          <td className={`${styles.numCell} ${styles['tono-success']} ${mesIdx % 2 === 1 ? styles.celdaMesImpar : ''} ${vistaMeses === 'recaudado' && mesIdx > 0 ? styles.bordeMes : ''}`}>
                            {vacio ? null : formatCOP(valores?.recaudado ?? 0)}
                          </td>
                        )}
                        <td className={`${styles.numCell} ${styles['tono-warning']} ${mesIdx % 2 === 1 ? styles.celdaMesImpar : ''}`}>
                          {vacio ? null : formatCOP(valores?.porRecaudar ?? 0)}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
