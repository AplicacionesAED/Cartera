// Puerto de zoho-payment-tracker/frontend/src/pages/Resumen.jsx -- "Resumen
// Gerencial". A diferencia del resto de módulos, este puerto no reutiliza
// Recharts (el legado sí lo usa, vía PlanVsRecaudoLineChart/EtapaRecaudoBars)
// sino los charts ApexCharts ya compartidos en features/dashboard/charts/,
// por regla explícita de Cartera (ver CLAUDE.md: "Dashboard con ApexCharts,
// nunca Recharts") -- misma información, otra librería de gráficos. Se omite
// deliberadamente el toggle de ocultar una serie desde la leyenda (ApexCharts
// ya lo da gratis con un clic en la leyenda, sin código extra); la vista
// "Acumulado" del line chart (Ambos/Mensual/Acumulado) sí está portada, ver
// EsperadoRecaudadoChart.jsx.
//
// Backend: modules/dashboard/dashboard.service.js -- #obtenerDashboardRecaudo
// (GET /negocios/dashboard-recaudo, mismos meses/totales/totalesInicial/
// totalesContraentrega/dias/totalesDia* que ya consume DashboardPage.jsx),
// #obtenerResumenPorEtapa (GET /negocios/resumen-etapas[/meses]), y el nuevo
// #obtenerResumenStats (GET /negocios/resumen-stats, agregado en esta misma
// migración -- recaudoAnio/separacionesMes para el encabezado del gráfico de
// tendencia, reutilizando obtenerDashboardRecaudo como única fuente de
// verdad, ver el comentario ahí). El footer de sync usa el también nuevo
// GET /oportunidades/sync/logs.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { exportarConsolidadoPdf } from './consolidadoPdf.js';
import { Maximize2, Minimize2, Layers, MapPin, Building, X, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, Building2, Wallet, AlertTriangle, Hourglass, Target, KeyRound } from 'lucide-react';
import { Field, Select } from '../../components/ui/Field.jsx';
import { MultiSelect } from '../../components/ui/MultiSelect.jsx';
import { frentesDisponibles as frentesDisponiblesCascada, torresDisponibles, podarSeleccion } from '../../utils/cascadaFiltros.js';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { InfoTooltip } from '../../components/ui/InfoTooltip.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useEstadoRetorno } from '../../hooks/useEstadoRetorno.js';
import { useModoEnfocado } from '../../hooks/useModoEnfocado.js';
import { getMesesResumen, getResumenEtapas, cerrarMesAnterior, getDashboardRecaudo, getResumenStats } from '../../api/dashboard.js';
import { getSyncLogsOportunidades } from '../../api/oportunidades.js';
import { etiquetaEtapa, compararEtapas } from '../../utils/etapas.js';
import { formatDateTime } from '../../utils/format.js';
import { EsperadoRecaudadoChart, fmtDia, fmtMes } from '../dashboard/charts/EsperadoRecaudadoChart.jsx';
import { EtapaRecaudoChart } from '../dashboard/charts/EtapaRecaudoChart.jsx';
import { KpiBloque } from './KpiBloque.jsx';
import dashStyles from '../dashboard/Dashboard.module.css';
import styles from './ResumenPage.module.css';

function fmtMoney(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
}

// ── Fechas: portadas tal cual de Resumen.jsx (legado) ──────────────────────

function mesKeyDeHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function diaKeyDeHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function restarDias(diaKey, n) {
  const [anio, mes, dia] = diaKey.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() - n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function finDeMes(mesKey) {
  const [anio, mes] = mesKey.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function mesesEntre(desdeMes, hastaMes) {
  const [dy, dm] = desdeMes.split('-').map(Number);
  const [hy, hm] = hastaMes.split('-').map(Number);
  const out = [];
  let idx = dy * 12 + (dm - 1);
  const idxFin = hy * 12 + (hm - 1);
  while (idx <= idxFin) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    idx += 1;
  }
  return out;
}
function restarMeses(mesKey, n) {
  const [anio, mes] = mesKey.split('-').map(Number);
  const totalMeses = anio * 12 + (mes - 1) - n;
  const anioResultado = Math.floor(totalMeses / 12);
  const mesResultado = (totalMeses % 12) + 1;
  return `${anioResultado}-${String(mesResultado).padStart(2, '0')}`;
}

const RANGOS_TENDENCIA = [
  { key: 'ultimoMes', label: 'Último mes', meses: 1 },
  { key: 'ultimoSemestre', label: 'Último semestre', meses: 6 },
  { key: 'ultimoAnio', label: 'Último año', meses: 12 },
  { key: 'ultimos5Anios', label: 'Últimos 5 años', meses: 60 },
  { key: 'total', label: 'Totalidad', meses: null },
];
const FILTROS_PORCENTAJE = [
  { key: 'ambos', label: 'Ambos' },
  { key: 'inicial', label: 'Cuota inicial (30%)' },
  { key: 'contraentrega', label: 'Saldo contraentrega (70%)' },
];
const VISTAS_LINEA = [
  { key: 'ambos', label: 'Ambos' },
  { key: 'mensual', label: 'Mensual' },
  { key: 'acumulado', label: 'Acumulado' },
];

// ── Consolidado de Cartera por Etapa: mismas columnas/grupos EXACTOS que
// ConsolidadoCarteraEtapa.jsx (legado) -- cifras en miles de millones, misma
// convención del Excel manual que reemplaza. ──────────────────────────────

function formatMM(value) {
  if (value == null || isNaN(value)) return '—';
  return `$${(value / 1_000_000_000).toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}
function formatPct(value) {
  if (value == null || isNaN(value)) return '—';
  return `${(value * 100).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
function formatInt(value) {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString('es-CO');
}
function formatFechaCorte(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// El span de cada grupo se deriva de COLUMNAS (cuántas columnas declaran ese
// `grupo`) en vez de un número fijo -- un span hardcodeado que no coincide
// con el conteo real desalinea el <th colSpan> del grupo contra las columnas
// de verdad (encontrado como bug real: "Recaudado" tenía span:4 pero son 5
// columnas con grupo:1, así que el encabezado de "Por recaudar" arrancaba un
// puesto antes de lo debido y todo lo de ahí en adelante quedaba corrido).
const GRUPOS_BASE = [
  { label: 'Cifras generales', tono: 'info' },
  { label: 'Recaudado', tono: 'success' },
  { label: 'Por recaudar', tono: 'warning' },
];
const COLUMNAS = [
  { key: 'uniTotales', grupo: 0, label: 'Unidades totales', nota: 'Inmuebles de la etapa en el inventario de Zoho, sin proyectos excluidos ni unidades marcadas con * en el nombre.', render: (e) => formatInt(e.uniTotales) },
  { key: 'uniVendidasFidu', grupo: 0, label: 'Unidades vendidas', nota: 'Inmuebles cuyo estado fiducia es distinto de LIBRE. El estado fiducia es VIP si el inmueble es VIP en Zoho; si no, el estado del negocio de la fiducia vinculado; y LIBRE si no tiene negocio.', render: (e) => formatInt(e.uniVendidasFidu) },
  { key: 'uniDisponible', grupo: 0, label: 'Unidades disponibles', nota: 'Inmuebles con estado fiducia LIBRE. Es igual a las unidades totales menos las vendidas.', render: (e) => formatInt(e.uniDisponible) },
  { key: 'valorTotalUnidadesDisponibles', grupo: 0, label: 'Valor unidades disponibles', nota: 'Suma del precio unitario (Unit_Price de Zoho) de los inmuebles con estado fiducia LIBRE. La fiducia no trae valores para estos inmuebles.', render: (e) => formatMM(e.valorTotalUnidadesDisponibles) },
  { key: 'valorTotalVentasFiduciaria', grupo: 0, label: 'Valor ventas fiduciaria', nota: 'Suma del Valor venta de la fiducia de cada negocio vendido. En las Etapas 1 y 2, si el negocio está VENDIDO, se usa el Valor factura. No usa el plan de pagos de Zoho.', render: (e) => formatMM(e.valorTotalVentasFiduciaria) },
  { key: 'valorCuotasIniciales', grupo: 0, label: 'Valor cuotas iniciales', nota: 'Suma de la cuota inicial de la fiducia de cada negocio vendido. No usa el plan de pagos de Zoho.', render: (e) => formatMM(e.valorCuotasIniciales) },
  { key: 'valorTotalVenta', grupo: 0, label: 'Valor total de venta', nota: 'Valor ventas fiduciaria más valor unidades disponibles.', render: (e) => formatMM(e.valorTotalVenta) },
  { key: 'recaudoReal', grupo: 1, label: 'Recaudado a la fecha', nota: 'Suma del Total pagado de la conciliación de cada negocio vendido, a la fecha de corte. En los negocios sin plan de pagos en Zoho se suman sus movimientos de la fiducia con las mismas reglas de la conciliación (sin el asiento de venta y desde el último desistimiento).', render: (e) => formatMM(e.recaudoReal) },
  { key: 'recaudoCuotaInicial', grupo: 1, label: 'Recaudado cuota inicial', nota: 'Parte de lo recaudado que cubre la cuota inicial de la fiducia: por cada negocio vendido, lo pagado hasta el valor de su cuota inicial.', render: (e) => formatMM(e.recaudoCuotaInicial) },
  { key: 'recaudoCredito', grupo: 1, label: 'Recaudado crédito', nota: 'Parte de lo recaudado que supera la cuota inicial: recaudado a la fecha menos recaudado cuota inicial. Lo pagado se aplica primero a la cuota inicial.', render: (e) => formatMM(e.recaudoCredito) },
  { key: 'pctRecaudoSobreVentasFiduciaria', grupo: 1, label: '% Recaudo / total venta', nota: 'Recaudado a la fecha ÷ valor total de venta (ventas fiduciaria más unidades disponibles).', render: (e) => formatPct(e.pctRecaudoSobreVentasFiduciaria) },
  { key: 'pctRecaudoSobreCuotaInicial', grupo: 1, label: '% Recaudo / cuota inicial', nota: 'Recaudado cuota inicial ÷ valor cuotas iniciales.', render: (e) => formatPct(e.pctRecaudoSobreCuotaInicial) },
  { key: 'pendienteTotalFiduciaria', grupo: 2, label: 'Pendiente por recaudar', nota: 'Suma, por negocio vendido, de su Valor venta menos lo pagado. Un negocio que pagó de más no resta a los demás.', render: (e) => formatMM(e.pendienteTotalFiduciaria) },
  { key: 'pendienteCuotaInicial', grupo: 2, label: 'Cuotas iniciales por recaudar', nota: 'Suma, por negocio vendido, de su cuota inicial menos lo pagado hasta ese valor.', render: (e) => formatMM(e.pendienteCuotaInicial) },
  { key: 'pendienteCredito', grupo: 2, label: 'Crédito por recaudar', nota: 'Suma, por negocio vendido, de lo que falta de su Valor venta después de cubrir la cuota inicial.', render: (e) => formatMM(e.pendienteCredito) },
  { key: 'carteraMas5Dias', grupo: 2, label: 'Cartera > 5 días', nota: 'Mora de las cuotas iniciales según el plan de pagos de Zoho: suma de lo que falta pagar de las cuotas iniciales vencidas, en los negocios vendidos con más de 5 días de atraso. Usa el mismo criterio de mora de Cartera en Gestión y no excluye trámites pendientes, porque ese marcador no existe en el sistema.', render: (e) => formatMM(e.carteraMas5Dias) },
  { key: 'pctCarteraMas5Dias', grupo: 2, label: '% Cartera > 5 días', nota: 'Cartera > 5 días ÷ lo esperado a la fecha de las cuotas iniciales del plan de pagos de Zoho (las que ya cumplieron su fecha) en los negocios vendidos.', render: (e) => formatPct(e.pctCarteraMas5Dias) },
  { key: 'fechaCorte', grupo: 2, label: 'Fecha de corte', nota: 'Día en que se calcularon las cifras: hoy en el mes en vivo, o el día del cierre en un mes guardado.', render: (e) => formatFechaCorte(e.fechaCorte) },
];
const GRUPOS = GRUPOS_BASE.map((g, i) => ({ ...g, span: COLUMNAS.filter((c) => c.grupo === i).length }));
const INICIO_DE_GRUPO = new Set(GRUPOS.reduce((acc, g, i) => {
  const prevSpan = GRUPOS.slice(0, i).reduce((s, x) => s + x.span, 0);
  acc.push(COLUMNAS[prevSpan]?.key);
  return acc;
}, []));

// Mismos hex que --color-{info,success,warning}-{surface,ink} de tokens.css,
// como ARGB -- para que el PDF exportado (ver handleExportConsolidadoPdf) se
// vea con el mismo código de color por grupo que la tabla en pantalla.
const TONOS_EXCEL = {
  info: { bg: 'FFE8E9FD', ink: 'FF232BED' },
  success: { bg: 'FFDFF3EA', ink: 'FF014145' },
  warning: { bg: 'FFFFF3D6', ink: 'FF8A5A00' },
};

function FilaEtapa({ fila, esTotal }) {
  return (
    <tr className={esTotal ? styles.filaTotal : styles.fila}>
      <td className={`${styles.colSticky} ${esTotal ? styles.colStickyTotal : ''}`}>
        {esTotal ? 'TOTAL GENERAL' : etiquetaEtapa(fila.etapa)}
      </td>
      {COLUMNAS.map((col) => {
        const g = GRUPOS[col.grupo];
        return (
          <td key={col.key} className={`${styles.celda} ${INICIO_DE_GRUPO.has(col.key) ? styles.bordeGrupo : ''}`}>
            {col.render(fila)}
          </td>
        );
      })}
    </tr>
  );
}

function ConsolidadoCarteraEtapa({ data }) {
  if (data === null) return <p className={dashStyles.loadingState}>Cargando Consolidado de Cartera…</p>;
  if (!data.etapas?.length) return <p className={dashStyles.emptyHint}>Sin datos.</p>;

  return (
    <div>
      <div className={styles.consolidadoWrap}>
        <table className={styles.consolidadoTable}>
          <colgroup>
            <col className={styles.colEtapaGroup} />
            {COLUMNAS.map((col) => <col key={col.key} className={styles.colDato} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={styles.colSticky} />
              {GRUPOS.map((g) => (
                <th key={g.label} colSpan={g.span} className={`${styles.grupoHeader} ${styles[`tono-${g.tono}`]}`}>{g.label}</th>
              ))}
            </tr>
            <tr>
              <th className={styles.colSticky}>
                <span className={styles.tituloCol}>
                  <span>Etapa</span>
                  <InfoTooltip titulo="Etapa" text="Etapa constructiva del inmueble, según el Proyecto/Torre del inventario de Zoho. La última fila suma todas las etapas." />
                </span>
              </th>
              {COLUMNAS.map((col) => {
                const g = GRUPOS[col.grupo];
                return (
                  <th key={col.key} title={col.label} className={`${styles.colHeader} ${styles[`acento-${g.tono}`]} ${INICIO_DE_GRUPO.has(col.key) ? styles.bordeGrupo : ''}`}>
                    <span className={styles.tituloCol}>
                      <span>{col.label}</span>
                      {col.nota && <InfoTooltip titulo={col.label} text={col.nota} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.etapas.map((fila) => <FilaEtapa key={fila.etapa} fila={fila} />)}
            <FilaEtapa fila={data.total} esTotal />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────

export function ResumenPage() {
  const { usuario } = useAuth();

  // Consolidado de Cartera por Etapa (navegable mes a mes)
  const [meses, setMeses] = useState([]);
  const [mes, setMes] = useEstadoRetorno('resumen:mes', '');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cerrando, setCerrando] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);

  // KPIs + tendencia (mismo backend que Dashboard Plan vs. Recaudo)
  const [planRecaudo, setPlanRecaudo] = useState(null);
  const [resumenStats, setResumenStats] = useState(null);
  const [syncLogs, setSyncLogs] = useState([]);
  const [rangoTendencia, setRangoTendencia] = useEstadoRetorno('resumen:rango', 'total');
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [filtroPorcentaje, setFiltroPorcentaje] = useEstadoRetorno('resumen:filtroPorcentaje', 'ambos');
  const [vistaLinea, setVistaLinea] = useEstadoRetorno('resumen:vistaLinea', 'ambos'); // 'ambos' | 'mensual' | 'acumulado'
  const [etapaAbierta, setEtapaAbierta] = useState(false);
  const [enfocado, toggleEnfocado] = useModoEnfocado();

  const [etapaFilter, setEtapaFilter] = useState([]);
  const [frenteFilter, setFrenteFilter] = useState([]);
  const [torreFilter, setTorreFilter] = useState([]);
  const [etapasDisponibles, setEtapasDisponibles] = useState([]);
  const [frentesDisponibles, setFrentesDisponibles] = useState([]);
  const [frentesPorEtapa, setFrentesPorEtapa] = useState({});
  const [torresPorFrente, setTorresPorFrente] = useState({});
  const [torresPorEtapaFrente, setTorresPorEtapaFrente] = useState({});

  useEffect(() => {
    getMesesResumen().then((res) => {
      setMeses(res.data);
      setMes((prev) => (prev && res.data.some((m) => m.mes === prev) ? prev : res.data.find((m) => m.enVivo)?.mes ?? res.data[res.data.length - 1]?.mes ?? ''));
    });
    getResumenStats().then((res) => setResumenStats(res.data)).catch(() => {});
    getSyncLogsOportunidades(5).then((res) => setSyncLogs(res.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mes) return;
    setDatos(null);
    getResumenEtapas(mes).then((res) => setDatos(res.data)).catch((err) => setError(err.message));
  }, [mes]);

  useEffect(() => {
    let vigente = true;
    getDashboardRecaudo({ etapa: etapaFilter, frente: frenteFilter, torre: torreFilter, page: 1, limit: 1 })
      .then((res) => {
        if (!vigente) return;
        setPlanRecaudo(res.data);
        setEtapasDisponibles(res.data.etapasDisponibles ?? []);
        setFrentesDisponibles(res.data.frentesDisponibles ?? []);
        setFrentesPorEtapa(res.data.frentesPorEtapa ?? {});
        setTorresPorFrente(res.data.torresPorFrente ?? {});
        setTorresPorEtapaFrente(res.data.torresPorEtapaFrente ?? {});
      });
    return () => { vigente = false; };
  }, [etapaFilter, frenteFilter, torreFilter]);

  // Cambiar etapas o frentes poda lo que ya no está disponible en los niveles de abajo.
  const opcionesCascada = useMemo(
    () => ({ frentesDisponibles, frentesPorEtapa, torresPorFrente, torresPorEtapaFrente }),
    [frentesDisponibles, frentesPorEtapa, torresPorFrente, torresPorEtapaFrente],
  );
  const actualizarCascada = useCallback((campo, valor) => {
    const sel = podarSeleccion(opcionesCascada, { etapa: etapaFilter, frente: frenteFilter, torre: torreFilter, [campo]: valor });
    setEtapaFilter(sel.etapa);
    setFrenteFilter(sel.frente);
    setTorreFilter(sel.torre);
  }, [opcionesCascada, etapaFilter, frenteFilter, torreFilter]);

  const frenteOptions = frentesDisponiblesCascada(opcionesCascada, etapaFilter);
  const torreOptions = torresDisponibles(opcionesCascada, etapaFilter, frenteFilter);
  const hayFiltrosUbicacion = etapaFilter.length > 0 || frenteFilter.length > 0 || torreFilter.length > 0;
  const limpiarFiltrosUbicacion = () => { setEtapaFilter([]); setFrenteFilter([]); setTorreFilter([]); };

  const aniosDisponibles = useMemo(() => {
    const anios = new Set((planRecaudo?.meses ?? []).map((m) => Number(m.slice(0, 4))));
    return [...anios].sort((a, b) => a - b);
  }, [planRecaudo]);

  const granularidadTendencia = rangoTendencia === 'ultimoMes' ? 'dia' : rangoTendencia === 'ultimoSemestre' ? 'quincena' : 'mes';

  const mesesTendencia = useMemo(() => {
    const listaMeses = planRecaudo?.meses ?? [];
    if (rangoTendencia === 'anio') return listaMeses.filter((m) => m.startsWith(`${anioSeleccionado}-`));
    const opt = RANGOS_TENDENCIA.find((r) => r.key === rangoTendencia);
    if (!opt?.meses) return listaMeses;
    const desde = restarMeses(mesKeyDeHoy(), opt.meses - 1);
    const hasta = mesKeyDeHoy();
    return listaMeses.filter((m) => m >= desde && m <= hasta);
  }, [planRecaudo, rangoTendencia, anioSeleccionado]);

  const diasTendencia = useMemo(() => {
    if (granularidadTendencia !== 'dia') return [];
    const dias = planRecaudo?.dias ?? [];
    const hasta = diaKeyDeHoy();
    const desde = restarDias(hasta, 29);
    return dias.filter((d) => d >= desde && d <= hasta);
  }, [planRecaudo, granularidadTendencia]);

  const quincenas = useMemo(() => {
    if (granularidadTendencia !== 'quincena') return [];
    const hasta = diaKeyDeHoy();
    const desdeMes = restarMeses(mesKeyDeHoy(), 5);
    const buckets = [];
    for (const m of mesesEntre(desdeMes, mesKeyDeHoy())) {
      const q1desde = `${m}-01`;
      const q1hastaCalendario = `${m}-15`;
      if (q1desde <= hasta) buckets.push({ key: q1desde, desde: q1desde, hasta: q1hastaCalendario < hasta ? q1hastaCalendario : hasta });
      const q2desde = `${m}-16`;
      const q2hastaCalendario = finDeMes(m);
      if (q2desde <= hasta) buckets.push({ key: q2desde, desde: q2desde, hasta: q2hastaCalendario < hasta ? q2hastaCalendario : hasta });
    }
    return buckets;
  }, [granularidadTendencia]);

  const totalesQuincena = useMemo(() => {
    if (granularidadTendencia !== 'quincena' || quincenas.length === 0) return {};
    const fuente = filtroPorcentaje === 'inicial' ? planRecaudo?.totalesDiaInicial : filtroPorcentaje === 'contraentrega' ? planRecaudo?.totalesDiaContraentrega : planRecaudo?.totalesDia;
    const dias = planRecaudo?.dias ?? [];
    const out = {};
    for (const q of quincenas) {
      let esperado = 0, recaudado = 0, porRecaudar = 0;
      for (const d of dias) {
        if (d >= q.desde && d <= q.hasta) {
          esperado += fuente?.[d]?.esperado ?? 0;
          recaudado += fuente?.[d]?.recaudado ?? 0;
          porRecaudar += fuente?.[d]?.porRecaudar ?? 0;
        }
      }
      out[q.key] = { esperado, recaudado, porRecaudar };
    }
    return out;
  }, [planRecaudo, quincenas, filtroPorcentaje, granularidadTendencia]);

  const puntosTendencia = granularidadTendencia === 'dia' ? diasTendencia : granularidadTendencia === 'quincena' ? quincenas.map((q) => q.key) : mesesTendencia;

  const totalesElegidos = useMemo(() => {
    if (granularidadTendencia === 'quincena') return totalesQuincena;
    if (granularidadTendencia === 'dia') {
      if (filtroPorcentaje === 'inicial') return planRecaudo?.totalesDiaInicial ?? {};
      if (filtroPorcentaje === 'contraentrega') return planRecaudo?.totalesDiaContraentrega ?? {};
      return planRecaudo?.totalesDia ?? {};
    }
    if (filtroPorcentaje === 'inicial') return planRecaudo?.totalesInicial ?? {};
    if (filtroPorcentaje === 'contraentrega') return planRecaudo?.totalesContraentrega ?? {};
    return planRecaudo?.totales ?? {};
  }, [planRecaudo, filtroPorcentaje, granularidadTendencia, totalesQuincena]);

  const kpisRecaudo = useMemo(() => {
    const sumarVentana = (fuenteDia, fuenteMes) => {
      let esperado = 0, recaudado = 0;
      if (granularidadTendencia === 'mes') {
        for (const m of mesesTendencia) {
          const t = fuenteMes?.[m];
          esperado += t?.esperado ?? 0;
          recaudado += t?.recaudado ?? 0;
        }
      } else {
        const dias = granularidadTendencia === 'dia' ? diasTendencia : (quincenas.length > 0 ? (planRecaudo?.dias ?? []).filter((d) => d >= quincenas[0].desde && d <= quincenas[quincenas.length - 1].hasta) : []);
        for (const d of dias) {
          const t = fuenteDia?.[d];
          esperado += t?.esperado ?? 0;
          recaudado += t?.recaudado ?? 0;
        }
      }
      return { esperado, recaudado };
    };
    if (!planRecaudo) return null;
    const total = sumarVentana(planRecaudo.totalesDia, planRecaudo.totales);
    const inicial = sumarVentana(planRecaudo.totalesDiaInicial, planRecaudo.totalesInicial);
    const contraentrega = sumarVentana(planRecaudo.totalesDiaContraentrega, planRecaudo.totalesContraentrega);
    return {
      totalidad100: total.esperado, recaudado100: total.recaudado, porRecaudar100: Math.max(0, total.esperado - total.recaudado),
      totalidad30: inicial.esperado, recaudado30: inicial.recaudado, porRecaudar30: Math.max(0, inicial.esperado - inicial.recaudado),
      totalidad70: contraentrega.esperado, recaudado70: contraentrega.recaudado, pendienteContraentrega: Math.max(0, contraentrega.esperado - contraentrega.recaudado),
    };
  }, [planRecaudo, granularidadTendencia, mesesTendencia, diasTendencia, quincenas]);

  const kpisActuales = useMemo(() => {
    const t = planRecaudo?.totalesColumnasFijas;
    if (!t) return null;
    return { cuotasEnMora: t.cuotasEnMora, montoEnMora: t.montoEnMora, valorDisponible: t.valorDisponible, cantidadDisponible: t.cantidadDisponible, cuotasEnMoraInicial: t.cuotasEnMoraInicial, montoEnMoraInicial: t.montoEnMoraInicial, valorVendidos: t.valorVendidos, cantidadVendidos: t.cantidadVendidos };
  }, [planRecaudo]);

  const labelVentana = rangoTendencia === 'anio' ? `Año ${anioSeleccionado}` : (RANGOS_TENDENCIA.find((r) => r.key === rangoTendencia)?.label ?? '');
  const formatLabelTendencia = granularidadTendencia === 'dia' || granularidadTendencia === 'quincena' ? fmtDia : fmtMes;

  async function handleCerrarMes() {
    setCerrando(true);
    try {
      await cerrarMesAnterior();
      const res = await getMesesResumen();
      setMeses(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCerrando(false);
    }
  }

  // PDF horizontal del consolidado del mes que se está viendo (nombre: mes del consolidado + fecha de exportación).
  async function handleExportConsolidadoPdf() {
    if (!datos) return;
    setExportandoPdf(true);
    try {
      await exportarConsolidadoPdf({ datos, columnas: COLUMNAS, grupos: GRUPOS, tonos: TONOS_EXCEL, etiquetaEtapa });
    } catch (err) {
      setError(err.message);
    } finally {
      setExportandoPdf(false);
    }
  }

  const lastSync = syncLogs[0];
  const syncOk = syncLogs.filter((s) => s.status === 'success').length;
  const syncErr = syncLogs.filter((s) => s.status === 'error').length;

  return (
    <div className={dashStyles.page}>
      <div className={dashStyles.header}>
        <div className={dashStyles.headerText}>
          <h1 className={dashStyles.title}>Resumen Gerencial</h1>
          <p className={dashStyles.subtitle}>Cartera de cobranza.</p>
        </div>
        <div className={dashStyles.headerActions}>
          {usuario?.esAdmin && (
            <Button variant="secondary" onClick={handleCerrarMes} disabled={cerrando}>{cerrando ? 'Cerrando…' : 'Cerrar mes anterior'}</Button>
          )}
        </div>
      </div>

      {error && <div className={dashStyles.formError}>{error}</div>}

      {/* Filtros globales de ubicación -- afectan KPIs y tendencia */}
      <div className={styles.toolbarCard}>
      <div className={styles.toolbarFila}>
        {etapasDisponibles.length > 0 && (
          <Field className={dashStyles.fieldSm} label={<span className={styles.labelConIcono}><Layers size={13} />Etapa</span>}>
            {(p) => (
              <MultiSelect {...p} options={etapasDisponibles.map((et) => ({ value: et, label: etiquetaEtapa(et) }))} value={etapaFilter} onChange={(v) => actualizarCascada('etapa', v)} placeholder="Todas las etapas" />
            )}
          </Field>
        )}
        {frentesDisponibles.length > 0 && (
          <Field className={dashStyles.fieldSm} label={<span className={styles.labelConIcono}><MapPin size={13} />Frente</span>}>
            {(p) => (
              <MultiSelect {...p} options={frenteOptions} value={frenteFilter} onChange={(v) => actualizarCascada('frente', v)} placeholder="Todos los frentes" />
            )}
          </Field>
        )}
        {frenteFilter.length > 0 && torreOptions.length > 0 && (
          <Field className={dashStyles.fieldSm} label={<span className={styles.labelConIcono}><Building size={13} />Torre</span>}>
            {(p) => (
              <MultiSelect {...p} options={torreOptions.map((tr) => ({ value: tr, label: `Torre ${tr}` }))} value={torreFilter} onChange={(v) => setTorreFilter(v)} placeholder="Todas las torres" />
            )}
          </Field>
        )}
        {hayFiltrosUbicacion && (
          <button type="button" className={styles.limpiar} onClick={limpiarFiltrosUbicacion}><X size={12} /> Limpiar</button>
        )}
      </div>

      {/* Filtro de periodo -- afecta KPIs y tendencia */}
      <div className={`${styles.toolbarFila} ${styles.toolbarPeriodo}`}>
        <span className={styles.filtroLabel}>Periodo</span>
        <div className={dashStyles.toggleGroup}>
          {RANGOS_TENDENCIA.map((r) => (
            <button key={r.key} type="button" className={`${dashStyles.toggleButton} ${rangoTendencia === r.key ? dashStyles.toggleButtonActive : ''}`} onClick={() => setRangoTendencia(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        {aniosDisponibles.length > 0 && (
          <select
            value={rangoTendencia === 'anio' ? anioSeleccionado : ''}
            onChange={(e) => { setAnioSeleccionado(Number(e.target.value)); setRangoTendencia('anio'); }}
            className={`${dashStyles.toggleButton} ${rangoTendencia === 'anio' ? dashStyles.toggleButtonActive : ''}`}
          >
            <option value="" disabled>Filtrar por año…</option>
            {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>
      </div>

      {/* KPIs gerenciales */}
      <div className={styles.kpiSecciones}>
        <KpiBloque storageKey="resumen:kpi100" titulo={`Total (100%) — ${labelVentana}`} resumen={kpisRecaudo ? `Totalidad ${fmtMoney(kpisRecaudo.totalidad100)} · Recaudado ${fmtMoney(kpisRecaudo.recaudado100)} · Por recaudar ${fmtMoney(kpisRecaudo.porRecaudar100)}` : null}>
          <div className={dashStyles.statsGrid}>
            <StatTileConHint label="Totalidad del 100%" icon={Target} tone="primary" value={kpisRecaudo ? fmtMoney(kpisRecaudo.totalidad100) : '—'} description={`Suma de las cuotas esperadas del plan de pagos de Zoho (Propuesta de pago; Forma de pago si no hay propuesta) de todos los negocios, con fecha dentro del periodo (${labelVentana}). La última cuota (saldo contraentrega) se ajusta al Valor venta de la fiducia y toma la fecha de entrega configurada en Ajustes. Por usar fechas del plan, no coincide con Valor ventas fiduciaria del Consolidado.`} />
            <StatTileConHint label="Recaudado del 100%" icon={CheckCircle2} tone="success" value={kpisRecaudo ? fmtMoney(kpisRecaudo.recaudado100) : '—'} description={`Suma de los pagos de la fiducia (movimientos de cada negocio), por la fecha del pago, dentro del periodo (${labelVentana}). No depende de a qué cuota se aplicó cada pago.`} />
            <StatTileConHint label="Por recaudar (100%)" icon={Hourglass} tone="neutral" value={kpisRecaudo ? fmtMoney(kpisRecaudo.porRecaudar100) : '—'} description={`Totalidad del 100% menos el recaudado del 100% del mismo periodo (${labelVentana}); nunca negativo.`} />
            <StatTileConHint label="Cuotas vencidas (100%) (actual)" icon={AlertTriangle} tone="warning" value={kpisActuales ? String(kpisActuales.cuotasEnMora) : '—'} sub={kpisActuales ? fmtMoney(kpisActuales.montoEnMora) : undefined} description="Cuotas del plan de pagos de Zoho (cuota inicial y saldo contraentrega) de todos los negocios con fecha anterior a hoy que no están pagadas completas. El valor es lo que falta por pagar de ellas. No cambia con el periodo." />
          </div>
        </KpiBloque>

        <KpiBloque storageKey="resumen:kpi30" titulo={`Cuota inicial (30%) — ${labelVentana}`} resumen={kpisRecaudo ? `Totalidad ${fmtMoney(kpisRecaudo.totalidad30)} · Recaudado ${fmtMoney(kpisRecaudo.recaudado30)} · Por recaudar ${fmtMoney(kpisRecaudo.porRecaudar30)}` : null}>
          <div className={dashStyles.statsGrid}>
            <StatTileConHint label="Totalidad del 30%" icon={Target} tone="primary" value={kpisRecaudo ? fmtMoney(kpisRecaudo.totalidad30) : '—'} description={`Suma de las cuotas de cuota inicial del plan de pagos de Zoho (todas menos el saldo contraentrega) con fecha dentro del periodo (${labelVentana}).`} />
            <StatTileConHint label="Recaudado del 30%" icon={CheckCircle2} tone="success" value={kpisRecaudo ? fmtMoney(kpisRecaudo.recaudado30) : '—'} description={`Pagos de la fiducia que la conciliación aplica a las cuotas de cuota inicial, por la fecha del pago, dentro del periodo (${labelVentana}).`} />
            <StatTileConHint label="Por recaudar (30%)" icon={Hourglass} tone="neutral" value={kpisRecaudo ? fmtMoney(kpisRecaudo.porRecaudar30) : '—'} description={`Totalidad del 30% menos el recaudado del 30% del mismo periodo (${labelVentana}); nunca negativo.`} />
            <StatTileConHint label="Cuotas vencidas (30%) (actual)" icon={AlertTriangle} tone="warning" value={kpisActuales ? String(kpisActuales.cuotasEnMoraInicial) : '—'} sub={kpisActuales ? fmtMoney(kpisActuales.montoEnMoraInicial) : undefined} description="Cuotas de cuota inicial del plan de pagos de Zoho de todos los negocios con fecha anterior a hoy que no están pagadas completas. El valor es lo que falta por pagar de ellas. No cambia con el periodo." />
          </div>
        </KpiBloque>

        <KpiBloque storageKey="resumen:kpi70" titulo={`Saldo contraentrega (70%) — ${labelVentana}`} resumen={kpisRecaudo ? `Totalidad ${fmtMoney(kpisRecaudo.totalidad70)} · Recaudado ${fmtMoney(kpisRecaudo.recaudado70)} · Pendiente ${fmtMoney(kpisRecaudo.pendienteContraentrega)}` : null}>
          <div className={dashStyles.statsGrid}>
            <StatTileConHint label="Totalidad del 70%" icon={Target} tone="primary" value={kpisRecaudo ? fmtMoney(kpisRecaudo.totalidad70) : '—'} description={`Valor de la última cuota del plan de pagos de Zoho (saldo contraentrega, ajustada al Valor venta de la fiducia) de los negocios cuya fecha de entrega cae dentro del periodo (${labelVentana}). La fecha es la de entrega configurada en Ajustes.`} />
            <StatTileConHint label="Saldo recaudado contraentrega" icon={Wallet} tone="success" value={kpisRecaudo ? fmtMoney(kpisRecaudo.recaudado70) : '—'} description={`Pagos de la fiducia que la conciliación aplica al saldo contraentrega (la última cuota del plan), por la fecha del pago, dentro del periodo (${labelVentana}).`} />
            <StatTileConHint label="Saldo pendiente contraentrega" icon={Hourglass} tone="neutral" value={kpisRecaudo ? fmtMoney(kpisRecaudo.pendienteContraentrega) : '—'} description={`Totalidad del 70% menos el saldo recaudado del mismo periodo (${labelVentana}); nunca negativo.`} />
          </div>
        </KpiBloque>

        <div>
          <h3 className={styles.kpiSeccionTitulo}>Inventario y ventas (actual)<InfoTooltip text="Foto de hoy, sin filtro de periodo. Un inmueble es disponible si su estado fiducia (módulo Inmuebles) es LIBRE, y vendido en cualquier otro caso." /></h3>
          <div className={dashStyles.statsGrid}>
            <StatTileConHint label="Inmuebles disponibles (actual)" icon={Building2} tone="primary" value={kpisActuales ? fmtMoney(kpisActuales.valorDisponible) : '—'} sub={kpisActuales ? `${kpisActuales.cantidadDisponible} unidades` : undefined} description="Cantidad de inmuebles con estado fiducia LIBRE y suma de su precio unitario (Unit_Price de Zoho), a hoy. Es la misma regla de Unidades disponibles y Valor unidades disponibles del Consolidado." />
            <StatTileConHint label="Inmuebles vendidos (actual)" icon={KeyRound} tone="success" value={kpisActuales ? fmtMoney(kpisActuales.valorVendidos) : '—'} sub={kpisActuales ? `${kpisActuales.cantidadVendidos} unidades` : undefined} description="Cantidad de inmuebles con estado fiducia distinto de LIBRE y suma de su Valor venta de la fiducia, a hoy. Es la misma regla de Unidades vendidas y Valor ventas fiduciaria del Consolidado." />
          </div>
        </div>
      </div>

      {/* Tendencia: plan de pagos vs. recaudo real */}
      <div className={enfocado ? styles.tendenciaEnfocada : styles.tendenciaCard}>
        <div className={styles.tendenciaHeader}>
          <div className={styles.tendenciaHeaderTop}>
            <h2 className={styles.tendenciaTitulo}>
              Plan de pagos vs. Recaudo — tendencia
              <InfoTooltip text="Compara lo esperado según el plan de pagos de Zoho contra lo efectivamente recaudado (pagos de la fiducia). Incluye periodos futuros del plan." />
            </h2>
            <div className={styles.tendenciaHeaderAcciones}>
              {resumenStats && (
                <span className={styles.tendenciaStats}>
                  Recaudado en el año <InfoTooltip text="Suma de lo recaudado en los meses del año actual: pagos de la fiducia de todos los negocios, por la fecha del pago. No cambia con los filtros de periodo ni de ubicación." /><strong>{fmtMoney(resumenStats.recaudoAnio)}</strong>
                  <span className={styles.puntoSep}>·</span>
                  Separaciones este mes <InfoTooltip text="Cantidad de oportunidades de Zoho cuya fecha de Pago de separación cae dentro del mes actual." /><strong>{resumenStats.separacionesMes}</strong>
                </span>
              )}
              <Button variant="secondary" onClick={toggleEnfocado}>
                {enfocado ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                {enfocado ? 'Salir de pantalla completa' : 'Pantalla completa'}
              </Button>
            </div>
          </div>
          <div className={styles.tendenciaPeriodoActual}>
            Periodo: <span className={styles.tendenciaPeriodoBadge}>{labelVentana}</span>
            <span className={styles.tendenciaPeriodoNota}>— cambiar arriba, en "Periodo"</span>
          </div>
          <div className={dashStyles.toggleGroup}>
            {FILTROS_PORCENTAJE.map((f) => (
              <button key={f.key} type="button" className={`${dashStyles.toggleButton} ${filtroPorcentaje === f.key ? dashStyles.toggleButtonActive : ''}`} onClick={() => setFiltroPorcentaje(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className={dashStyles.toggleGroup}>
            {VISTAS_LINEA.map((v) => (
              <button key={v.key} type="button" className={`${dashStyles.toggleButton} ${vistaLinea === v.key ? dashStyles.toggleButtonActive : ''}`} onClick={() => setVistaLinea(v.key)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <EsperadoRecaudadoChart
          meses={puntosTendencia}
          totales={totalesElegidos}
          formatLabel={formatLabelTendencia}
          unidadPeriodo={granularidadTendencia === 'dia' ? 'día' : granularidadTendencia === 'quincena' ? 'quincena' : 'mes'}
          altura={300}
          vista={vistaLinea}
          fill={enfocado}
        />
      </div>

      {/* Consolidado de Cartera por Etapa */}
      <div className={styles.consolidadoCard}>
        <div className={styles.consolidadoCabecera}>
          <div>
            <h2 className={styles.consolidadoTitulo}>
              Consolidado de Cartera por Etapa
              <InfoTooltip text="Réplica en vivo del Excel “CONSOLIDADO DE CARTERA” que Gerencia arma cada mes. Las unidades y el precio de las disponibles salen del inventario de Zoho; las ventas, cuotas iniciales y pagos, de la fiducia; y la cartera, del plan de pagos de Zoho." />
            </h2>
            <p className={styles.consolidadoSubtitulo}>Cifras en miles de millones de pesos (COP). Pasa el cursor sobre ⓘ para ver cómo se calcula cada columna.</p>
          </div>
          <div className={styles.consolidadoControles}>
            <Field className={styles.fieldMesSm} label="Mes">
              {(p) => (
                <Select {...p} value={mes} onChange={(e) => setMes(e.target.value)}>
                  {meses.map((m) => <option key={m.mes} value={m.mes}>{m.etiqueta}</option>)}
                </Select>
              )}
            </Field>
            {datos?.enVivo && <Badge variant="info">En vivo</Badge>}
            <Button variant="secondary" onClick={handleExportConsolidadoPdf} disabled={!datos || exportandoPdf}>
              {exportandoPdf ? 'Exportando…' : 'Exportar PDF'}
            </Button>
          </div>
        </div>
        <ConsolidadoCarteraEtapa data={datos} />
        {meses.length <= 1 && <p className={styles.avisoMeses}>Todavía no hay meses cerrados para navegar -- se va a ir guardando una foto automáticamente al cierre de cada mes.</p>}
      </div>

      {/* Recaudo por Etapa del proyecto (colapsable) */}
      <div className={styles.consolidadoCard}>
        <button type="button" className={styles.etapaToggle} onClick={() => setEtapaAbierta((v) => !v)}>
          <h2 className={styles.consolidadoTitulo}>
            Recaudo por Etapa del proyecto
            <InfoTooltip text="Esperado según el plan de pagos de Zoho contra recaudado (pagos de la fiducia), agrupado por etapa constructiva (1, 2, 3…), no por la Etapa/Stage de Zoho." />
          </h2>
          {etapaAbierta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {etapaAbierta && <EtapaRecaudoChart totalesPorEtapa={planRecaudo?.totalesPorEtapa ?? {}} />}
      </div>

      {/* Footer sync */}
      <div className={styles.syncFooter}>
        {lastSync ? (
          <>
            {lastSync.status === 'success' ? <CheckCircle2 size={14} className={styles.syncOk} /> : lastSync.status === 'error' ? <XCircle size={14} className={styles.syncErr} /> : <Clock size={14} className={styles.syncPend} />}
            <span>Última sync Zoho: <strong>{formatDateTime(lastSync.iniciadoEn)}</strong> · {lastSync.registrosSync} registros<InfoTooltip text="Última sincronización de datos del CRM (Zoho), que alimenta los inmuebles y las oportunidades (planes de pagos). La fiducia se carga aparte, con el Excel diario." /></span>
            <span className={styles.syncResumen}>Últimas 5: {syncOk} OK · {syncErr} errores<InfoTooltip text="Resultado de las 5 sincronizaciones más recientes de Zoho." /></span>
          </>
        ) : (
          <span>Sin historial de sincronización</span>
        )}
      </div>
    </div>
  );
}

function StatTileConHint({ label, value, sub, description, icon: Icon, tone = 'primary' }) {
  return (
    <div className={`${dashStyles.statTile} ${styles.tileBloque}`}>
      <div className={dashStyles.statTop}>
        {Icon && (
          <span className={`${dashStyles.iconChip} ${dashStyles[`tone_${tone}`]}`}>
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
        )}
        {description && <InfoTooltip text={description} />}
      </div>
      <span className={dashStyles.statValue}>{value}</span>
      <span className={styles.statSub}>{sub ?? ' '}</span>
      <span className={dashStyles.statLabel}>{label}</span>
    </div>
  );
}
