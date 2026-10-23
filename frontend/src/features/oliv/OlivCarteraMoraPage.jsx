// "Cartera en Gestión" de Oliv (Jefe Gabriel, 2026-09-24: "Ahora el de
// Cartera", mismo pedido "tal cual Baía Kristal" que motivó Resumen/
// Dashboard). Puerto de cartera-mora/CarteraMoraPage.jsx -- backend YA
// existía casi completo (olivResumen.service.js#obtenerCarteraMora, GET
// /oliv/resumen/cartera-mora, montado sobre el mismo cache que Resumen/
// Dashboard) -- este módulo es 100% de presentación.
//
// Adaptaciones reales respecto a Baía Kristal (mismas 2 que Resumen/
// Dashboard, más una tercera propia de este módulo):
// 1. Sin columnas/filtros Etapa/Frente -- Oliv es un solo proyecto, solo
//    Torre (plano, sin cascada, mismo criterio que OlivDashboardPage).
// 2. Sin fila de Trámite/Canje ni el menú contextual para marcarlos --
//    esos 2 flags viven en `Negocio` (tabla real, editable) en Baía
//    Kristal; el "negocio" de Oliv es una vista compuesta calculada en
//    vivo (olivNegocio.service.js), sin ningún lugar donde persistir un
//    flag por negocio.
// 3. El menú contextual usa fila.id/inmuebleId/oportunidadId (mismo
//    contrato que OlivDashboardPage), no negocioId/opportunityId.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { AlertTriangle, Search, Building2, MapPin, X, Briefcase, Warehouse, ExternalLink, Download, Layers, Banknote, Percent, CheckCircle2 } from 'lucide-react';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { MultiSelect } from '../../components/ui/MultiSelect.jsx';
import { SortHeader } from '../../components/ui/SortHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { ariaSort } from '../../hooks/useSortableTable.js';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { getCarteraMoraOliv } from '../../api/olivResumen.js';
import { formatCOP, formatDate } from '../../utils/format.js';
import { StatTile } from '../dashboard/StatTile.jsx';
import { CeldaDoble, ChipDias, ValorVencido } from '../cartera-mora/CarteraCeldas.jsx';
import dashStyles from '../dashboard/Dashboard.module.css';
import styles from '../cartera-mora/CarteraMoraPage.module.css';
import { rutaApp } from '../../utils/rutas.js';
import { descargarInformeCarteraOliv } from './informeCarteraOliv.js';

// Misma paleta que dashboard/OlivDashboardPage.jsx#COLOR_EXCEL -- mismo
// lenguaje visual para cualquier .xlsx que exporte este dashboard, Cartera
// incluida.
const COLOR_EXCEL = {
  headerFijaBg: 'FF1B21A6',
  headerTexto: 'FFFFFFFF',
  filaImparBg: 'FFF8FAFC',
  filaParBg: 'FFFFFFFF',
  textoPendiente: 'FFB45309',
  textoVencido: 'FFDC2626',
};

// Un builder compartido para las 2 vistas (inicial/contraentrega) -- misma
// filosofía que en CarteraMoraPage.jsx (Baía Kristal): el Excel es una foto
// fiel de lo que ya se ve en pantalla (mismas columnas, mismo color por tono
// que `tonoWarning`/`tonoDanger` en la tabla), sin Etapa/Frente (Oliv es un
// solo proyecto, solo Torre).
const EXCEL_COLUMNAS_CONTRAENTREGA = [
  { key: 'torre', header: 'TORRE', width: 14, align: 'left', render: (f) => f.torre ?? '—' },
  { key: 'unidad', header: 'UNIDAD', width: 16, align: 'left', render: (f) => f.unidad ?? '—' },
  { key: 'comprador', header: 'COMPRADOR', width: 32, align: 'left', render: (f) => f.comprador ?? '—' },
  { key: 'referencia', header: 'REFERENCIA', width: 16, align: 'left', render: (f) => f.referenciaRecaudo ?? '' },
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

export function OlivCarteraMoraPage() {
  const [filtros, setFiltros] = usePersistentState('oliv-cartera-mora:filtros', { search: '', torre: [], estadoInmueble: [], vista: 'inicial', rango: '' });
  const [pagina, setPagina] = usePersistentState('oliv-cartera-mora:pagina', 1);

  // Enlaces desde Inicio (?vista=&rango=): aplican esos filtros una vez y limpian la URL.
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const vista = searchParams.get('vista');
    const rango = searchParams.get('rango');
    const buscar = searchParams.get('buscar');
    if (!vista && !rango && !buscar) return;
    setFiltros(() => ({ search: buscar ?? '', torre: [], estadoInmueble: [], vista: vista === 'contraentrega' ? 'contraentrega' : 'inicial', rango: rango ?? '' }));
    setPagina(1);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sort, setSort] = usePersistentState('oliv-cartera-mora:sort', { key: null, direction: null });
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [menuContextual, setMenuContextual] = useState(null);

  const ultimaPeticionRef = useRef(0);

  const cargar = useCallback(async (p) => {
    const miId = ++ultimaPeticionRef.current;
    setCargando(true);
    try {
      const res = await getCarteraMoraOliv({
        search: filtros.search || undefined,
        torre: filtros.torre || undefined,
        estadoInmueble: filtros.estadoInmueble || undefined,
        rango: filtros.rango || undefined,
        vista: filtros.vista,
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
      if (miId === ultimaPeticionRef.current) setCargando(false);
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

  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return { key: null, direction: null };
    });
  }

  // Clic en la fila abre el registro (negocio o, si no tiene negocio, el inmueble). Se ignora si el
  // clic fue sobre un enlace/botón o si el usuario estaba seleccionando texto.
  function abrirFila(e, fila) {
    if (e.target.closest('a, button, input, select')) return;
    if (window.getSelection()?.toString()) return;
    const destino = `/oliv/negocios/${fila.id}`;
    if (destino) navigate(destino);
  }

  function abrirMenuContextual(e, fila) {
    e.preventDefault();
    setMenuContextual({ x: e.clientX, y: e.clientY, fila });
  }

  async function handleExport() {
    setExportando(true);
    try {
      const res = await getCarteraMoraOliv({
        search: filtros.search || undefined,
        torre: filtros.torre || undefined,
        estadoInmueble: filtros.estadoInmueble || undefined,
        rango: filtros.rango || undefined,
        vista: filtros.vista,
        sortBy: sort.key ?? undefined,
        sortDir: sort.direction ?? undefined,
        page: 1,
        limit: 9999,
      });
      const filas = res.data.data;
      const fecha = new Date().toISOString().slice(0, 10);
      if (filtros.vista === 'contraentrega') {
        const wb = construirLibroCarteraMora(filas, EXCEL_COLUMNAS_CONTRAENTREGA, 'Cartera en Gestión');
        await descargarLibroCarteraMora(wb, `oliv-cartera-en-gestion-${filtros.vista}-${fecha}.xlsx`);
      } else {
        // Vista inicial: formato de la plantilla "Informe de Cartera" (con fórmulas de Excel).
        await descargarInformeCarteraOliv(filas, `oliv-informe-de-cartera-${fecha}.xlsx`);
      }
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
  const hasFilters = filtros.search || filtros.torre.length || filtros.estadoInmueble.length || filtros.rango;

  function clearFilters() {
    setFiltros((prev) => ({ ...prev, search: '', torre: [], estadoInmueble: [], rango: '' }));
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
                <b className={styles.alertaNumero}>{formatCOP(resumen.totalMontoEnMora)}</b> pendientes.
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
                {(p) => <TextInput {...p} value={filtros.search} onChange={(e) => actualizarFiltro('search', e.target.value)} placeholder="Torre, unidad, comprador o referencia…" />}
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
                          <th aria-sort={ariaSort(sort, 'torre')}><SortHeader label="Torre" sortKey="torre" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'unidad')}><SortHeader label="Nomenclatura" sortKey="unidad" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'comprador')}><SortHeader label="Comprador" sortKey="comprador" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'referenciaRecaudo')}><SortHeader label="Referencia" sortKey="referenciaRecaudo" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'fechaSaldoContraentrega')}><SortHeader label="Fecha vencida" sortKey="fechaSaldoContraentrega" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'montoEnMora')}><SortHeader label="Valor pendiente" sortKey="montoEnMora" sort={sort} onSort={toggleSort} align="center" /></th>
                        </tr>
                      ) : (
                        <tr>
                          <th aria-sort={ariaSort(sort, 'unidad')}><SortHeader label="Nomenclatura" sortKey="unidad" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'vista')}><SortHeader label="Vista" sortKey="vista" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'referenciaRecaudo')}><SortHeader label="Encargo" sortKey="referenciaRecaudo" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'area')}><SortHeader label="Área (m²)" sortKey="area" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'comprador')}><SortHeader label="Propietarios" sortKey="comprador" sort={sort} onSort={toggleSort} /></th>
                          <th aria-sort={ariaSort(sort, 'fechaContrato')}><SortHeader label="Fecha contrato" sortKey="fechaContrato" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'fechaSaldoContraentrega')}><SortHeader label="Fecha últ. pago" sortKey="fechaSaldoContraentrega" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'valorInmueble')}><SortHeader label="Valor venta" sortKey="valorInmueble" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'valorM2')}><SortHeader label="Valor m²" sortKey="valorM2" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'valorCuotaInicial')}><SortHeader label="Cuota inicial" sortKey="valorCuotaInicial" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'credito')}><SortHeader label="Crédito" sortKey="credito" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'totalAbonado')}><SortHeader label="Valor abonado" sortKey="totalAbonado" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'pctRecaudo')}><SortHeader label="% de recaudo" sortKey="pctRecaudo" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'cuotasEnMora')}><SortHeader label="Cuotas mora" sortKey="cuotasEnMora" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'maxDiasAtraso')}><SortHeader label="Días mora" sortKey="maxDiasAtraso" sort={sort} onSort={toggleSort} align="center" /></th>
                          <th aria-sort={ariaSort(sort, 'montoEnMora')}><SortHeader label="Valor vencido" sortKey="montoEnMora" sort={sort} onSort={toggleSort} align="center" /></th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {(meta.data ?? []).length === 0 ? (
                        <tr><td colSpan={esContraentrega ? 6 : 16} className={styles.sinResultados}>Sin resultados.</td></tr>
                      ) : esContraentrega ? (
                        meta.data.map((f) => (
                          <tr key={f.id} onClick={(e) => abrirFila(e, f)} onContextMenu={(e) => abrirMenuContextual(e, f)} className={styles.filaCtxMenu}>
                            <td><CeldaDoble arriba="Oliv" abajo={f.torre ?? null} /></td>
                            <td>{f.unidad ?? '—'}</td>
                            <td className={styles.truncar} title={f.comprador ?? ''}>{f.comprador ?? '—'}</td>
                            <td>{f.referenciaRecaudo ?? ''}</td>
                            <td className={`${styles.numCellCentro} ${styles.tonoWarning}`}>{formatDate(f.fechaSaldoContraentrega)}</td>
                            <td className={styles.numCellCentro}><ValorVencido valor={f.montoEnMora} /></td>
                          </tr>
                        ))
                      ) : (
                        meta.data.map((f) => (
                          <tr key={f.id} onClick={(e) => abrirFila(e, f)} onContextMenu={(e) => abrirMenuContextual(e, f)} className={styles.filaCtxMenu}>
                            <td><Link to={`/oliv/negocios/${f.id}`}>{f.unidad ?? f.id}</Link></td>
                            <td>{f.vista ?? '—'}</td>
                            <td>{f.referenciaRecaudo ?? ''}</td>
                            <td className={styles.numCellCentro}>{f.area != null ? f.area.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                            <td className={styles.truncar} title={f.comprador ?? ''}>{f.comprador ?? '—'}</td>
                            <td className={styles.numCellCentro}>{formatDate(f.fechaContrato)}</td>
                            <td className={styles.numCellCentro}>{formatDate(f.fechaSaldoContraentrega)}</td>
                            <td className={styles.numCellCentro}>{f.valorInmueble != null ? formatCOP(f.valorInmueble) : '—'}</td>
                            <td className={styles.numCellCentro}>{f.valorM2 != null ? formatCOP(f.valorM2) : '—'}</td>
                            <td className={styles.numCellCentro}>{f.valorCuotaInicial != null ? formatCOP(f.valorCuotaInicial) : '—'}</td>
                            <td className={styles.numCellCentro}>{f.credito != null ? formatCOP(f.credito) : '—'}</td>
                            <td className={styles.numCellCentro}>{formatCOP(f.totalAbonado ?? 0)}</td>
                            <td className={styles.numCellCentro}>{fmtPct(f.pctRecaudo)}</td>
                            <td className={styles.numCellCentro}>{f.cuotasEnMora}</td>
                            <td className={styles.numCellCentro}><ChipDias dias={f.maxDiasAtraso} /></td>
                            <td className={styles.numCellCentro}><ValorVencido valor={f.montoEnMora} /></td>
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
