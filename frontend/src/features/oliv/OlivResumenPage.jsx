// Resumen Gerencial de Oliv (Jefe Gabriel, 2026-09-25: "la idea es que sea
// como en Baía Kristal, tal cual") -- puerto de
// resumen/ResumenPage.jsx, con las mismas piezas (KPIs, tendencia
// ApexCharts, Consolidado de Cartera exportable a Excel, cierre de mes
// admin, footer de sync) y las mismas 2 adaptaciones reales que el backend
// (ver olivResumen.service.js):
//   - Sin jerarquía Etapa->Frente->Torre -- los filtros de ubicación son
//     Torre + Estado del inmueble, planos, sin cascada entre sí (decisión
//     confirmada con el usuario).
//   - "Consolidado de Cartera por TORRE", no por Etapa -- mismas 3 secciones
//     de color (Cifras generales/Recaudado/Por recaudar), columnas
//     adaptadas a lo que Oliv realmente tiene (sin distinción Vendidas-Fidu
//     vs Vendidas-CRM, que no existe acá).
// El resto (EsperadoRecaudadoChart, useModoEnfocado, exportar Excel con
// ExcelJS, StatTileConHint) se REUSA tal cual de Baía Kristal -- mismos
// componentes/estilos compartidos, cross-import ya es un patrón establecido
// en los módulos de Oliv (ej. OlivEncargosListPage.jsx reusa
// fiducia/EncargosListPage.module.css).
import { useCallback, useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { Maximize2, Minimize2, MapPin, Building2, X, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, Wallet, AlertTriangle, Hourglass, Target, KeyRound } from 'lucide-react';
import { Field, Select } from '../../components/ui/Field.jsx';
import { MultiSelect } from '../../components/ui/MultiSelect.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { InfoTooltip } from '../../components/ui/InfoTooltip.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useEstadoRetorno } from '../../hooks/useEstadoRetorno.js';
import { useModoEnfocado } from '../../hooks/useModoEnfocado.js';
import {
  getMesesResumenOliv, getResumenTorresOliv, cerrarMesAnteriorOliv,
  getDashboardRecaudoOliv, getResumenStatsOliv,
} from '../../api/olivResumen.js';
import { getSyncStatusOportunidadesOliv } from '../../api/oliv.js';
import { formatDateTime } from '../../utils/format.js';
import { EsperadoRecaudadoChart, fmtDia, fmtMes } from '../dashboard/charts/EsperadoRecaudadoChart.jsx';
import { TorreRecaudoChart } from '../dashboard/charts/TorreRecaudoChart.jsx';
import { KpiBloque } from '../resumen/KpiBloque.jsx';
import { exportarConsolidadoPdf } from '../resumen/consolidadoPdf.js';
import dashStyles from '../dashboard/Dashboard.module.css';
import styles from '../resumen/ResumenPage.module.css';

function fmtMoney(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
}

// ── Fechas: portadas tal cual de ResumenPage.jsx (Baía Kristal) ────────────

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
  { key: 'contraentrega', label: 'Saldo final (70%)' },
];
const VISTAS_LINEA = [
  { key: 'ambos', label: 'Ambos' },
  { key: 'mensual', label: 'Mensual' },
  { key: 'acumulado', label: 'Acumulado' },
];

// ── Consolidado de Cartera por Torre: mismo patrón visual que
// ConsolidadoCarteraEtapa (Baía Kristal), columnas adaptadas a lo que Oliv
// realmente tiene (sin distinción Vendidas-Fidu vs Vendidas-CRM). ─────────

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

const NOTA_CARTERA_5D = 'Cuotas de la Cuota Inicial con más de 5 días de atraso, sobre lo esperado a la fecha -- mismo criterio de mora activa usado en el resto del sistema.';

const GRUPOS_BASE = [
  { label: 'Cifras generales', tono: 'info' },
  { label: 'Recaudado', tono: 'success' },
  { label: 'Por recaudar', tono: 'warning' },
];
const COLUMNAS = [
  { key: 'uniTotales', grupo: 0, label: 'UNI TOTALES', render: (t) => formatInt(t.uniTotales) },
  { key: 'uniVendidas', grupo: 0, label: 'UNIDADES VENDIDAS', render: (t) => formatInt(t.uniVendidas) },
  { key: 'uniDisponible', grupo: 0, label: 'UNIDADES DISPONIBLE', render: (t) => formatInt(t.uniDisponible) },
  { key: 'valorTotalVenta', grupo: 0, label: 'VALOR TOTAL VENTA (VENDIDAS+DISPONIBLES)', render: (t) => formatMM(t.valorTotalVenta) },
  { key: 'valorTotalVentas', grupo: 0, label: 'VALOR TOTAL VENTAS', render: (t) => formatMM(t.valorTotalVentas) },
  { key: 'valorCuotasIniciales', grupo: 0, label: 'VALOR CUOTAS INICIALES', render: (t) => formatMM(t.valorCuotasIniciales) },
  { key: 'valorTotalUnidadesDisponibles', grupo: 0, label: 'VALOR($) UNIDADES DISPONIBLES', render: (t) => formatMM(t.valorTotalUnidadesDisponibles) },
  { key: 'recaudoReal', grupo: 1, label: 'VR. TOTAL RECAUDADO A LA FECHA', render: (t) => formatMM(t.recaudoReal) },
  { key: 'pctRecaudoSobreVentasFiduciaria', grupo: 1, label: '% RECAUDO / VENTAS', render: (t) => formatPct(t.pctRecaudoSobreVentasFiduciaria) },
  { key: 'pctRecaudoSobreCuotaInicial', grupo: 1, label: '% RECAUDO / CUOTA INICIAL', render: (t) => formatPct(t.pctRecaudoSobreCuotaInicial) },
  { key: 'carteraMas5Dias', grupo: 1, label: 'CARTERA > 5 DÍAS', nota: NOTA_CARTERA_5D, render: (t) => formatMM(t.carteraMas5Dias) },
  { key: 'pctCarteraMas5Dias', grupo: 1, label: '% CARTERA > 5 DÍAS', nota: NOTA_CARTERA_5D, render: (t) => formatPct(t.pctCarteraMas5Dias) },
  { key: 'pendienteTotalFiduciaria', grupo: 2, label: 'PENDIENTE POR RECAUDAR', render: (t) => formatMM(t.pendienteTotalFiduciaria) },
  { key: 'pendienteCuotaInicial', grupo: 2, label: 'CUOTAS INICIALES POR RECAUDAR', render: (t) => formatMM(t.pendienteCuotaInicial) },
  { key: 'pendienteCredito', grupo: 2, label: 'CRÉDITO POR RECAUDAR', render: (t) => formatMM(t.pendienteCredito) },
  { key: 'fechaCorte', grupo: 2, label: 'FECHA DE CORTE INFO', render: (t) => formatFechaCorte(t.fechaCorte) },
];
const GRUPOS = GRUPOS_BASE.map((g, i) => ({ ...g, span: COLUMNAS.filter((c) => c.grupo === i).length }));
const INICIO_DE_GRUPO = new Set(GRUPOS.reduce((acc, g, i) => {
  const prevSpan = GRUPOS.slice(0, i).reduce((s, x) => s + x.span, 0);
  acc.push(COLUMNAS[prevSpan]?.key);
  return acc;
}, []));

const TONOS_EXCEL = {
  info: { bg: 'FFE8E9FD', ink: 'FF232BED' },
  success: { bg: 'FFDFF3EA', ink: 'FF014145' },
  warning: { bg: 'FFFFF3D6', ink: 'FF8A5A00' },
};
const EXCEL_BORDE_GRUPO = { left: { style: 'medium', color: { argb: 'FFC3CBD6' } } };
const EXCEL_BG_TOTAL = 'FFEEF1F5';

function FilaTorre({ fila, esTotal }) {
  return (
    <tr className={esTotal ? styles.filaTotal : styles.fila}>
      <td className={`${styles.colSticky} ${esTotal ? styles.colStickyTotal : ''}`}>
        {esTotal ? 'TOTAL GENERAL' : fila.torre}
      </td>
      {COLUMNAS.map((col) => {
        const g = GRUPOS[col.grupo];
        return (
          <td key={col.key} className={`${styles.celda} ${styles[`tono-${g.tono}`]} ${INICIO_DE_GRUPO.has(col.key) ? styles.bordeGrupo : ''}`}>
            {col.render(fila)}
          </td>
        );
      })}
    </tr>
  );
}

function ConsolidadoCarteraTorre({ data }) {
  if (data === null) return <p className={dashStyles.loadingState}>Cargando Consolidado de Cartera…</p>;
  if (!data.torres?.length) return <p className={dashStyles.emptyHint}>Sin datos.</p>;

  return (
    <div>
      <p className={styles.consolidadoNota}>
        Las columnas con ⓘ usan un criterio aproximado o recién confirmado.
      </p>
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
              <th className={styles.colSticky}>Torre</th>
              {COLUMNAS.map((col) => {
                const g = GRUPOS[col.grupo];
                return (
                  <th key={col.key} title={col.label} className={`${styles.colHeader} ${styles[`tono-${g.tono}`]} ${INICIO_DE_GRUPO.has(col.key) ? styles.bordeGrupo : ''}`}>
                    {col.label}
                    {col.nota && <InfoTooltip text={col.nota} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.torres.map((fila) => <FilaTorre key={fila.torre} fila={fila} />)}
            <FilaTorre fila={data.total} esTotal />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────

export function OlivResumenPage() {
  const { usuario } = useAuth();

  // Consolidado de Cartera por Torre (navegable mes a mes)
  const [meses, setMeses] = useState([]);
  const [mes, setMes] = useEstadoRetorno('oliv-resumen:mes', '');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cerrando, setCerrando] = useState(false);
  const [exportandoConsolidado, setExportandoConsolidado] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);

  // KPIs + tendencia (mismo backend que alimentaría un futuro "Dashboard
  // Plan vs. Recaudo" de Oliv, si llega a existir)
  const [planRecaudo, setPlanRecaudo] = useState(null);
  const [resumenStats, setResumenStats] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [rangoTendencia, setRangoTendencia] = useEstadoRetorno('oliv-resumen:rango', 'total');
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [filtroPorcentaje, setFiltroPorcentaje] = useEstadoRetorno('oliv-resumen:filtroPorcentaje', 'ambos');
  const [vistaLinea, setVistaLinea] = useEstadoRetorno('oliv-resumen:vistaLinea', 'ambos');
  const [torreChartAbierta, setTorreChartAbierta] = useState(false);
  const [enfocado, toggleEnfocado] = useModoEnfocado();

  // Sin jerarquía Etapa->Frente->Torre (Oliv es un solo proyecto) -- Torre y
  // Estado del inmueble son filtros planos, sin cascada entre sí.
  const [torreFilter, setTorreFilter] = useState([]);
  const [estadoInmuebleFilter, setEstadoInmuebleFilter] = useState([]);
  const [torresDisponibles, setTorresDisponibles] = useState([]);
  const [estadosInmuebleDisponibles, setEstadosInmuebleDisponibles] = useState([]);

  useEffect(() => {
    getMesesResumenOliv().then((res) => {
      setMeses(res.data);
      setMes((prev) => (prev && res.data.some((m) => m.mes === prev) ? prev : res.data.find((m) => m.enVivo)?.mes ?? res.data[res.data.length - 1]?.mes ?? ''));
    });
    getResumenStatsOliv().then((res) => setResumenStats(res.data)).catch(() => {});
    getSyncStatusOportunidadesOliv().then((res) => setSyncStatus(res.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mes) return;
    setDatos(null);
    getResumenTorresOliv(mes).then((res) => setDatos(res.data)).catch((err) => setError(err.message));
  }, [mes]);

  useEffect(() => {
    let vigente = true;
    getDashboardRecaudoOliv({ torre: torreFilter, estadoInmueble: estadoInmuebleFilter, page: 1, limit: 1 })
      .then((res) => {
        if (!vigente) return;
        setPlanRecaudo(res.data);
        setTorresDisponibles(res.data.torresDisponibles ?? []);
        setEstadosInmuebleDisponibles(res.data.estadosInmuebleDisponibles ?? []);
      });
    return () => { vigente = false; };
  }, [torreFilter, estadoInmuebleFilter]);

  const hayFiltrosUbicacion = torreFilter.length > 0 || estadoInmuebleFilter.length > 0;
  const limpiarFiltrosUbicacion = useCallback(() => { setTorreFilter([]); setEstadoInmuebleFilter([]); }, []);

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
      await cerrarMesAnteriorOliv();
      const res = await getMesesResumenOliv();
      setMeses(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCerrando(false);
    }
  }

  // PDF horizontal del consolidado por torre del mes que se está viendo (mismo formato que el de Baía Kristal).
  async function handleExportConsolidadoPdf() {
    if (!datos) return;
    setExportandoPdf(true);
    try {
      await exportarConsolidadoPdf({
        datos, columnas: COLUMNAS, grupos: GRUPOS, tonos: TONOS_EXCEL,
        titulo: 'Consolidado de Cartera por Torre — Oliv',
        encabezadoPrimera: 'TORRE',
        filasDatos: datos.torres,
        etiquetaFila: (fila) => fila.torre,
        nota: 'Consolidado de cartera de Oliv calculado sobre la conciliación real de sus negocios.',
        prefijoArchivo: 'Consolidado Cartera Oliv',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setExportandoPdf(false);
    }
  }

  async function handleExportConsolidado() {
    if (!datos) return;
    setExportandoConsolidado(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Consolidado');
      const fillSolida = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

      ws.getColumn(1).width = 16;
      COLUMNAS.forEach((_, i) => { ws.getColumn(i + 2).width = 20; });

      ws.mergeCells(1, 1, 2, 1);
      const torreHeader = ws.getCell(1, 1);
      torreHeader.value = 'TORRE';
      torreHeader.font = { bold: true };
      torreHeader.alignment = { vertical: 'middle', horizontal: 'left' };

      let cursor = 2;
      GRUPOS.forEach((g) => {
        const inicio = cursor;
        const fin = cursor + g.span - 1;
        if (fin > inicio) ws.mergeCells(1, inicio, 1, fin);
        const cell = ws.getCell(1, inicio);
        cell.value = g.label.toUpperCase();
        cell.fill = fillSolida(TONOS_EXCEL[g.tono].bg);
        cell.font = { bold: true, color: { argb: TONOS_EXCEL[g.tono].ink } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cursor = fin + 1;
      });

      COLUMNAS.forEach((col, i) => {
        const g = GRUPOS[col.grupo];
        const cell = ws.getCell(2, i + 2);
        cell.value = col.label;
        cell.fill = fillSolida(TONOS_EXCEL[g.tono].bg);
        cell.font = { bold: true, color: { argb: TONOS_EXCEL[g.tono].ink }, size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        if (INICIO_DE_GRUPO.has(col.key)) cell.border = EXCEL_BORDE_GRUPO;
      });
      ws.getRow(1).height = 20;
      ws.getRow(2).height = 34;

      const filas = [...datos.torres, datos.total];
      filas.forEach((fila, idx) => {
        const esTotal = idx === filas.length - 1;
        const row = ws.getRow(idx + 3);
        const torreCell = row.getCell(1);
        torreCell.value = esTotal ? 'TOTAL GENERAL' : fila.torre;
        torreCell.font = { bold: true };
        if (esTotal) torreCell.fill = fillSolida(EXCEL_BG_TOTAL);

        COLUMNAS.forEach((col, i) => {
          const g = GRUPOS[col.grupo];
          const cell = row.getCell(i + 2);
          cell.value = col.render(fila);
          cell.alignment = { horizontal: 'center' };
          if (esTotal) {
            cell.fill = fillSolida(EXCEL_BG_TOTAL);
            cell.font = { bold: true };
          } else {
            cell.fill = fillSolida(TONOS_EXCEL[g.tono].bg);
            cell.font = { color: { argb: TONOS_EXCEL[g.tono].ink } };
          }
          if (INICIO_DE_GRUPO.has(col.key)) cell.border = EXCEL_BORDE_GRUPO;
        });
      });

      ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resumen-gerencial-oliv-${datos.mes}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExportandoConsolidado(false);
    }
  }

  return (
    <div className={dashStyles.page}>
      <div className={dashStyles.header}>
        <div className={dashStyles.headerText}>
          <h1 className={dashStyles.title}>Resumen Gerencial</h1>
          <p className={dashStyles.subtitle}>Oliv · Cartera de cobranza.</p>
        </div>
        <div className={dashStyles.headerActions}>
          {usuario?.esAdmin && (
            <Button variant="secondary" onClick={handleCerrarMes} disabled={cerrando}>{cerrando ? 'Cerrando…' : 'Cerrar mes anterior'}</Button>
          )}
        </div>
      </div>

      {error && <div className={dashStyles.formError}>{error}</div>}

      {/* Filtros globales de ubicación -- afectan KPIs y tendencia. Sin
          cascada (Torre y Estado del inmueble son independientes, Oliv no
          tiene jerarquía Etapa->Frente->Torre). */}
      <div className={styles.toolbarCard}>
      <div className={styles.toolbarFila}>
        {torresDisponibles.length > 0 && (
          <Field className={dashStyles.fieldSm} label={<span className={styles.labelConIcono}><Building2 size={13} />Torre</span>}>
            {(p) => (
              <MultiSelect {...p} options={torresDisponibles} value={torreFilter} onChange={setTorreFilter} placeholder="Todas las torres" />
            )}
          </Field>
        )}
        {estadosInmuebleDisponibles.length > 0 && (
          <Field className={dashStyles.fieldSm} label={<span className={styles.labelConIcono}><MapPin size={13} />Estado del inmueble</span>}>
            {(p) => (
              <MultiSelect {...p} options={estadosInmuebleDisponibles} value={estadoInmuebleFilter} onChange={setEstadoInmuebleFilter} placeholder="Todos los estados" />
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
        <KpiBloque storageKey="oliv-resumen:kpi100" titulo={`Total (100%) — ${labelVentana}`} resumen={kpisRecaudo ? `Totalidad ${fmtMoney(kpisRecaudo.totalidad100)} · Recaudado ${fmtMoney(kpisRecaudo.recaudado100)} · Por recaudar ${fmtMoney(kpisRecaudo.porRecaudar100)}` : null}>
          <div className={dashStyles.statsGrid}>
            <StatTileConHint label="Totalidad del 100%" icon={Target} tone="primary" value={kpisRecaudo ? fmtMoney(kpisRecaudo.totalidad100) : '—'} description={`Total esperado de todo el plan de pagos (Cuota Inicial más Saldo), dentro del periodo seleccionado (${labelVentana}).`} />
            <StatTileConHint label="Recaudado del 100%" icon={CheckCircle2} tone="success" value={kpisRecaudo ? fmtMoney(kpisRecaudo.recaudado100) : '—'} description={`Todo lo realmente recaudado, sin importar a qué cuota se aplicó, dentro del periodo seleccionado (${labelVentana}).`} />
            <StatTileConHint label="Por recaudar (100%)" icon={Hourglass} tone="neutral" value={kpisRecaudo ? fmtMoney(kpisRecaudo.porRecaudar100) : '—'} description={`Plan de pagos esperado menos lo recaudado real, dentro del periodo seleccionado (${labelVentana}).`} />
            <StatTileConHint label="Cuotas vencidas (100%) (actual)" icon={AlertTriangle} tone="warning" value={kpisActuales ? String(kpisActuales.cuotasEnMora) : '—'} sub={kpisActuales ? fmtMoney(kpisActuales.montoEnMora) : undefined} description="Cuotas atrasadas de todo el plan de pagos (Cuota Inicial y Saldo), a hoy -- no cambia con el filtro de periodo." />
          </div>
        </KpiBloque>

        <KpiBloque storageKey="oliv-resumen:kpi30" titulo={`Cuota inicial (30%) — ${labelVentana}`} resumen={kpisRecaudo ? `Totalidad ${fmtMoney(kpisRecaudo.totalidad30)} · Recaudado ${fmtMoney(kpisRecaudo.recaudado30)} · Por recaudar ${fmtMoney(kpisRecaudo.porRecaudar30)}` : null}>
          <div className={dashStyles.statsGrid}>
            <StatTileConHint label="Totalidad del 30%" icon={Target} tone="primary" value={kpisRecaudo ? fmtMoney(kpisRecaudo.totalidad30) : '—'} description={`Total esperado de la Cuota Inicial según el plan de pagos, dentro del periodo seleccionado (${labelVentana}).`} />
            <StatTileConHint label="Recaudado del 30%" icon={CheckCircle2} tone="success" value={kpisRecaudo ? fmtMoney(kpisRecaudo.recaudado30) : '—'} description={`Lo realmente recaudado hacia la Cuota Inicial, dentro del periodo seleccionado (${labelVentana}).`} />
            <StatTileConHint label="Por recaudar (30%)" icon={Hourglass} tone="neutral" value={kpisRecaudo ? fmtMoney(kpisRecaudo.porRecaudar30) : '—'} description={`Cuota Inicial esperada menos lo recaudado real, dentro del periodo seleccionado (${labelVentana}).`} />
            <StatTileConHint label="Cuotas vencidas (30%) (actual)" icon={AlertTriangle} tone="warning" value={kpisActuales ? String(kpisActuales.cuotasEnMoraInicial) : '—'} sub={kpisActuales ? fmtMoney(kpisActuales.montoEnMoraInicial) : undefined} description="Cuotas atrasadas SOLO de la Cuota Inicial, a hoy -- no cambia con el filtro de periodo." />
          </div>
        </KpiBloque>

        <KpiBloque storageKey="oliv-resumen:kpi70" titulo={`Saldo final (70%) — ${labelVentana}`} resumen={kpisRecaudo ? `Totalidad ${fmtMoney(kpisRecaudo.totalidad70)} · Recaudado ${fmtMoney(kpisRecaudo.recaudado70)} · Pendiente ${fmtMoney(kpisRecaudo.pendienteContraentrega)}` : null}>
          <div className={dashStyles.statsGrid}>
            <StatTileConHint label="Totalidad del 70%" icon={Target} tone="primary" value={kpisRecaudo ? fmtMoney(kpisRecaudo.totalidad70) : '—'} description={`Total esperado del Saldo final según conciliación, dentro del periodo seleccionado (${labelVentana}).`} />
            <StatTileConHint label="Saldo recaudado" icon={Wallet} tone="success" value={kpisRecaudo ? fmtMoney(kpisRecaudo.recaudado70) : '—'} description={`Lo realmente recaudado hacia el Saldo final, dentro del periodo seleccionado (${labelVentana}).`} />
            <StatTileConHint label="Saldo pendiente" icon={Hourglass} tone="neutral" value={kpisRecaudo ? fmtMoney(kpisRecaudo.pendienteContraentrega) : '—'} description={`Saldo final según conciliación, menos lo recaudado real, dentro del periodo seleccionado (${labelVentana}).`} />
          </div>
        </KpiBloque>

        <div>
          <h3 className={styles.kpiSeccionTitulo}>Inventario y ventas (actual)</h3>
          <div className={dashStyles.statsGrid}>
            <StatTileConHint label="Inmuebles disponibles (actual)" icon={Building2} tone="primary" value={kpisActuales ? fmtMoney(kpisActuales.valorDisponible) : '—'} sub={kpisActuales ? `${kpisActuales.cantidadDisponible} unidades` : undefined} description="Valor y cantidad de los inmuebles sin negocio vinculado, a hoy." />
            <StatTileConHint label="Inmuebles vendidos (actual)" icon={KeyRound} tone="success" value={kpisActuales ? fmtMoney(kpisActuales.valorVendidos) : '—'} sub={kpisActuales ? `${kpisActuales.cantidadVendidos} unidades` : undefined} description="Valor y cantidad de los inmuebles con Estado = Vendido, a hoy." />
          </div>
        </div>
      </div>

      {/* Tendencia: plan de pagos vs. recaudo real */}
      <div className={enfocado ? styles.tendenciaEnfocada : styles.tendenciaCard}>
        <div className={styles.tendenciaHeader}>
          <div className={styles.tendenciaHeaderTop}>
            <h2 className={styles.tendenciaTitulo}>
              Plan de pagos vs. Recaudo — tendencia
              <InfoTooltip text="Compara, para todo el portafolio de Oliv, cuánto se esperaba recaudar según el plan de pagos contra lo efectivamente recaudado. Incluye periodos futuros del plan." />
            </h2>
            <div className={styles.tendenciaHeaderAcciones}>
              {resumenStats && (
                <span className={styles.tendenciaStats}>
                  Recaudado en el año <strong>{fmtMoney(resumenStats.recaudoAnio)}</strong>
                  <span className={styles.puntoSep}>·</span>
                  Separaciones este mes <strong>{resumenStats.separacionesMes}</strong>
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

      {/* Consolidado de Cartera por Torre */}
      <div className={styles.consolidadoCard}>
        <h2 className={styles.consolidadoTitulo}>
          Consolidado de Cartera por Torre
          <InfoTooltip text="Equivalente Oliv del Excel 'CONSOLIDADO DE CARTERA' de Baía Kristal, agrupado por Torre en vez de por Etapa constructiva." />
        </h2>
        <div className={styles.mesSelector}>
          <Field className={styles.fieldMesSm} label="Mes">
            {(p) => (
              <Select {...p} value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map((m) => <option key={m.mes} value={m.mes}>{m.etiqueta}</option>)}
              </Select>
            )}
          </Field>
          {datos?.enVivo && <Badge variant="info">En vivo</Badge>}
          <Button variant="secondary" className={styles.exportarConsolidado} onClick={handleExportConsolidado} disabled={!datos || exportandoConsolidado}>
            {exportandoConsolidado ? 'Exportando…' : 'Exportar Consolidado (Excel)'}
          </Button>
          <Button variant="secondary" onClick={handleExportConsolidadoPdf} disabled={!datos || exportandoPdf}>
            {exportandoPdf ? 'Exportando…' : 'Exportar Consolidado (PDF)'}
          </Button>
        </div>
        <ConsolidadoCarteraTorre data={datos} />
        {meses.length <= 1 && <p className={styles.avisoMeses}>Todavía no hay meses cerrados para navegar -- se va a ir guardando una foto automáticamente al cierre de cada mes.</p>}
      </div>

      {/* Recaudo por Torre (colapsable) */}
      <div className={styles.consolidadoCard}>
        <button type="button" className={styles.etapaToggle} onClick={() => setTorreChartAbierta((v) => !v)}>
          <h2 className={styles.consolidadoTitulo}>
            Recaudo por Torre
            <InfoTooltip text="Esperado vs. recaudado del plan de pagos, agrupado por Torre." />
          </h2>
          {torreChartAbierta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {torreChartAbierta && <TorreRecaudoChart totalesPorTorre={planRecaudo?.totalesPorTorre ?? {}} />}
      </div>

      {/* Footer sync -- Oliv solo expone el ÚLTIMO sync (GET
          /oliv/oportunidades/sync/status), no un historial de los últimos 5
          como Baía Kristal (GET /oportunidades/sync/logs no tiene
          equivalente todavía). */}
      <div className={styles.syncFooter}>
        {syncStatus && syncStatus.status !== 'never' ? (
          <>
            {syncStatus.status === 'success' ? <CheckCircle2 size={14} className={styles.syncOk} /> : syncStatus.status === 'error' ? <XCircle size={14} className={styles.syncErr} /> : <Clock size={14} className={styles.syncPend} />}
            <span>Última sync HubSpot: <strong>{formatDateTime(syncStatus.finalizadoEn)}</strong>{syncStatus.registrosSync != null ? ` · ${syncStatus.registrosSync} registros` : ''}</span>
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
