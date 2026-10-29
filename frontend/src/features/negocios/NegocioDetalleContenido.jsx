// Contenido del detalle de un negocio -- extraído de NegocioDetallePage.jsx
// para poder embeberlo como panel derecho de NegociosPage.jsx (layout
// maestro-detalle: sidebar con todos los negocios a la izquierda, detalle
// completo a la derecha, igual que zoho-payment-tracker/frontend/src/pages/Negocios.jsx).
// Recibe `id` como prop en vez de leerlo de useParams -- se usa tanto desde
// la ruta `/negocios/:id` como desde la selección dentro de `/negocios`.
import { useEffect, useState, useCallback } from 'react';
import { Badge } from '../../components/ui/Badge.jsx';
import { Accordion } from '../../components/ui/Accordion.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { ListaInfo, ListaFinanciera } from '../../components/ui/DatosFinancieros.jsx';
import { getNegocio, getMovimientosNegocio } from '../../api/negocios.js';
import { MovimientosTabla } from '../fiducia/MovimientosTabla.jsx';
import { ResumenMovimientos } from './ResumenMovimientos.jsx';
import base from './NegociosPage.module.css';
import { getSubformsOportunidad, refrescarSubformsOportunidad } from '../../api/oportunidades.js';
import { Button } from '../../components/ui/Button.jsx';
import { filtrarDatosResumen } from '../../utils/columnasExcluidas.js';
import { ordenarFinanciero } from '../../utils/ordenColumnas.js';
import { EstadoFiduciaBadge } from '../../components/ui/EstadoFiduciaBadge.jsx';
import { addFechaEstimada, formatFechaUTC } from '../../utils/planDePagos.js';
import { obtenerProyecto, desglosarPiso } from '../../utils/proyectos.js';
import { separarUnidadesAdicionales } from '../../utils/unidadesAdicionales.js';
import { obtenerConciliacionCompleta } from './obtenerConciliacionCompleta.js';
import { exportarEstadoCuenta } from './estadoCuentaPdf.js';
import { Vinculados } from '../../components/Vinculados.jsx';
import { formatExcelDate } from '../../utils/format.js';
import styles from './NegocioDetallePage.module.css';
import { DetalleHero, HeroBadges, HeroBoton, HeroSaldo } from '../../components/layout/DetalleHero.jsx';
import { Briefcase } from 'lucide-react';

// ── Helpers de presentación (idénticos a Negocios.jsx del legado) ──────────

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
    const formatted = formatExcelDate(value);
    return formatted !== '—' ? formatted : String(value);
  }
  if (k.includes('valor') || k.includes('monto') || k.includes('saldo') || k.includes('precio') ||
      k.includes('cuota') || k.includes('capital') || k.includes('deuda') || k.includes('abono') ||
      k.includes('descuento') || k.includes('credito') || k.includes('crédito') || k.includes('subsidio') ||
      k.includes('anticipo') || k.includes('importe') || k.includes('acreditacion') || k.includes('acreditación') ||
      k.includes('escritura') || k.includes('factura') || k.includes('aporte') || k.includes('canje') ||
      k.endsWith(' +') || k.endsWith(' (-)') || k.includes('movimiento posterior')) {
    const cop = formatCOP(value);
    return cop !== null ? cop : String(value);
  }
  if (k.includes('area') || k.includes('área')) {
    const n = parseFloat(String(value));
    if (!isNaN(n)) return `${n} m²`;
  }
  return String(value);
}

const APTO_KEYS = [
  'nomenclatura', 'area', 'área', 'm2', 'm²', 'tipo inmueble',
  'inventario', 'fideicomiso', 'etapa', 'torre', 'bloque', 'edificio',
  'matricula', 'matrícula', 'folio', 'parqueadero', 'garaje', 'parking',
  'deposito', 'depósito', 'bodega', 'notaria', 'notaría', 'escritura',
  'unidad', 'piso', 'interior', 'proyecto', 'fecha contrato', 'número escritura',
  'numero escritura', 'unidades adicionales',
];
const FIN_KEYS = [
  'valor venta', 'cuota inicial', 'credito', 'crédito', 'subsidio', 'descuento',
  'saldo actual', 'saldo inicial', 'valor factura', 'valor escritura', 'aportes',
  'valor acreditacion', 'valor acreditación', 'saldo may', 'saldo jun', 'saldo jul',
  'saldo ago', 'saldo sep', 'saldo oct', 'saldo nov', 'saldo dic', 'saldo ene',
  'saldo feb', 'saldo mar', 'saldo abr', 'saldo ',
  'canje', 'cumple', 'movimiento posterior', 'número factura', 'numero factura',
  ' +', ' (-)', 'fecha autoriz', 'fecha envío', 'fecha factura',
];

function categorizeDatos(datos) {
  const apto = {}, financiero = {}, otros = {};
  for (const [key, value] of Object.entries(datos || {})) {
    if (value == null || String(value).trim() === '') continue;
    const k = key.toLowerCase();
    if (APTO_KEYS.some((ak) => k === ak || k.includes(ak))) apto[key] = value;
    else if (FIN_KEYS.some((fk) => k === fk || k.includes(fk))) financiero[key] = value;
    else otros[key] = value;
  }
  return { apto, financiero, otros };
}

// Traduce un subconjunto de campos del Product de Zoho (InventarioItem.datos)
// al mismo formato [etiqueta, valor], para inmuebles que todavía no tienen
// Negocio.datos del cual sacar esta información.
function categorizeInventarioDatos(datosInmueble) {
  if (!datosInmueble) return [];
  const campos = [
    ['Código de inmueble', datosInmueble.C_digo_inmueble],
    ['Categoría', datosInmueble.Product_Category],
    ['Tipo', datosInmueble.Tipo_Apto],
    ['Área privada (m²)', datosInmueble.Area_Privada_en_M2],
    ['Área construida (m²)', datosInmueble.Area_Construida_en_M2],
    ['Piso', datosInmueble.Piso],
    ['Alcobas', datosInmueble.No_Alcobas],
    ['Baños', datosInmueble.No_Ba_os],
    ['Estrato', datosInmueble.Estrato],
  ];
  return campos.filter(([, v]) => v != null && String(v).trim() !== '');
}

function badgeConciliacion(c) {
  if (c.atrasada) return { txt: 'Atrasada', variant: 'danger' };
  if (c.estado === 'pagada') return { txt: 'Pagada', variant: 'success' };
  if (c.estado === 'parcial') return { txt: 'Parcial', variant: 'warning' };
  return { txt: 'Pendiente', variant: 'neutral' };
}

function labelCuota(etiqueta) {
  return /^\d+$/.test(etiqueta) ? `Cuota ${etiqueta}` : etiqueta;
}

function parseAmt(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return NaN;
  return parseFloat(s.replace(/[^0-9-]/g, ''));
}

function limpiarNombreComprador(nombre) {
  return String(nombre || '').replace(/^\|+\s*/, '').replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '');
}

// ── Forma de pago desde la oportunidad de Zoho vinculada ────────────────────

function PlanSubTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className={styles.sinDatos}>Sin datos</p>;
  }
  const SKIP = ['id', 'Created_Time', 'Modified_Time', '$line_tax', '$permissions', 'Owner'];
  const keys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP.includes(k));
  const toLabel = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const moneyKeys = keys.filter((k) => rows.some((row) => { const n = parseAmt(row[k]); return !isNaN(n) && n >= 1000; }));
  const visibleRows = moneyKeys.length === 0
    ? rows
    : rows.filter((row) => moneyKeys.some((k) => { const n = parseAmt(row[k]); return !isNaN(n) && n !== 0; }));

  if (visibleRows.length === 0) {
    return <p className={styles.sinDatos}>Sin datos</p>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {keys.map((k) => <th key={k}>{toLabel(k)}</th>)}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r, i) => (
            <tr key={i}>
              {keys.map((k) => {
                const v = r[k];
                let d = '—';
                if (v != null && v !== '') {
                  if (typeof v === 'object') d = v.name || v.display_value || JSON.stringify(v);
                  else if (typeof v === 'number') d = formatCOP(v) ?? String(v);
                  else d = String(v);
                }
                return <td key={k}>{d}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanDePagosZoho({ oportunidad }) {
  const [subforms, setSubforms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  async function actualizarDesdeZoho() {
    setActualizando(true);
    setMensaje(null);
    try {
      const res = await refrescarSubformsOportunidad(oportunidad.id);
      setSubforms(res.data || { formaPago: [], propuestaPago: [] });
      setMensaje({ ok: true, texto: 'Plan de pagos actualizado desde Zoho.' });
    } catch (err) {
      setMensaje({ ok: false, texto: err.message || 'No se pudo actualizar desde Zoho.' });
    } finally {
      setActualizando(false);
    }
  }

  const botonActualizar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
      <Button variant="secondary" onClick={actualizarDesdeZoho} disabled={actualizando}>
        {actualizando ? 'Actualizando…' : 'Actualizar desde Zoho'}
      </Button>
      {mensaje && <span style={{ fontSize: 'var(--text-data-size)', color: mensaje.ok ? 'var(--color-success, #15803d)' : 'var(--color-danger, #b91c1c)' }}>{mensaje.texto}</span>}
    </div>
  );

  useEffect(() => {
    let alive = true;
    getSubformsOportunidad(oportunidad.id)
      .then((res) => { if (alive) setSubforms(res.data || { formaPago: [], propuestaPago: [] }); })
      .catch(() => { if (alive) setSubforms({ formaPago: [], propuestaPago: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [oportunidad.id]);

  if (loading) return <p className={styles.cargando}>Cargando…</p>;

  const forma = addFechaEstimada(subforms?.formaPago || [], oportunidad.fechaInicioPlanPagos);
  const propuesta = addFechaEstimada(subforms?.propuestaPago || [], oportunidad.fechaInicioPlanPagos);
  const tieneFechas = (rows) => rows.some((r) => 'Fecha estimada' in r);

  if (forma.length === 0 && propuesta.length === 0) {
    return (
      <div className={styles.seccionBody}>
        {botonActualizar}
        <p className={styles.sinDatosPad}>Sin forma ni propuesta de pago registradas</p>
      </div>
    );
  }

  const aviso = (
    <p className={styles.aviso}>* Fechas estimadas con periodicidad mensual desde la fecha de separación. No representan fechas contractuales.</p>
  );

  return (
    <div className={styles.seccionBody}>
      {botonActualizar}
      {forma.length > 0 && (
        <div>
          <p className={styles.subtitulo}>Forma de pago</p>
          <PlanSubTable rows={forma} />
          {tieneFechas(forma) && aviso}
        </div>
      )}
      {propuesta.length > 0 && (
        <div>
          <p className={styles.subtitulo}>Propuesta de pago</p>
          <PlanSubTable rows={propuesta} />
          {tieneFechas(propuesta) && aviso}
        </div>
      )}
    </div>
  );
}

// ── Movimientos ──────────────────────────────────────────────────────────

function MovimientosSection({ id }) {
  const [movimientos, setMovimientos] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [resumenMov, setResumenMov] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    (p = 1) => {
      setLoading(true);
      getMovimientosNegocio(id, { page: p, limit: 50 })
        .then((res) => {
          setMovimientos(res.data?.data ?? []);
          setPagination(res.data?.pagination ?? null);
          setResumenMov(res.data?.resumen ?? null);
          setPage(p);
        })
        .finally(() => setLoading(false));
    },
    [id]
  );

  useEffect(() => { load(1); }, [load]);

  return (
    <div>
      {loading && <p className={styles.cargando}>Cargando movimientos...</p>}
      {!loading && movimientos && movimientos.length === 0 && <p className={styles.sinDatosPad}>Sin movimientos registrados</p>}
      {!loading && movimientos && movimientos.length > 0 && (
        <>
          <ResumenMovimientos resumen={resumenMov} totalMovimientos={pagination?.total} />
          <div className={base.tableWrap}>
            <MovimientosTabla movimientos={movimientos} />
          </div>
          {pagination && (
            <Pagination page={page} pageSize={pagination.limit} total={pagination.total} onPageChange={load} />
          )}
        </>
      )}
    </div>
  );
}

// ── Conciliación ─────────────────────────────────────────────────────────

function CuotaRow({ c }) {
  const [expanded, setExpanded] = useState(false);
  const badge = badgeConciliacion(c);
  const tienePagos = c.pagosAplicados && c.pagosAplicados.length > 0;

  return (
    <>
      <tr className={tienePagos ? styles.filaClicable : ''} onClick={() => tienePagos && setExpanded((e) => !e)}>
        <td className={styles.colChevron}>
          {tienePagos && (
            <svg className={`${styles.chevronRow} ${expanded ? styles.chevronRowOpen : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </td>
        <td className={styles.nowrap}>{labelCuota(c.etiqueta)}</td>
        <td className={styles.nowrap}>{c.fechaEstimada ? formatFechaUTC(c.fechaEstimada) : '—'}</td>
        <td className={styles.nowrap}>{c.estado === 'pagada' && c.fechaCubierta ? formatFechaUTC(c.fechaCubierta) : '—'}</td>
        <td className={`${styles.nowrap} ${styles.right} ${styles.tabular}`}>{formatCOP(c.valorPlan) ?? '—'}</td>
        <td className={`${styles.nowrap} ${styles.right} ${styles.tabular}`}>
          {c.cubierto > 0 ? <span className={c.estado === 'pagada' ? styles.textoExito : styles.textoAmbar}>{formatCOP(c.cubierto)}</span> : <span className={styles.vacio}>—</span>}
        </td>
        <td className={`${styles.nowrap} ${styles.right} ${styles.tabular}`}>{formatCOP(c.valorPlan - c.cubierto) ?? '—'}</td>
        <td className={`${styles.nowrap} ${styles.right} ${styles.tabular}`}>
          {c.atrasada && c.diasAtraso != null ? <span className={styles.textoPeligro}>{c.diasAtraso}</span> : <span className={styles.vacio}>—</span>}
        </td>
        <td className={`${styles.nowrap} ${styles.right}`}>
          <Badge variant={badge.variant}>{badge.txt}</Badge>
          {c.atrasada && c.fechaEstimada && <span className={styles.notaVencida}>venció {formatFechaUTC(c.fechaEstimada)}</span>}
          {c.estado === 'pagada' && c.fechaCubierta && <span className={styles.notaPagada}>pagada el {formatFechaUTC(c.fechaCubierta)}</span>}
        </td>
      </tr>
      {expanded && tienePagos && (
        <tr className={styles.filaExpandida}>
          <td colSpan={9}>
            <div className={styles.listaPagos}>
              {c.pagosAplicados.map((p, i) => {
                const mismoMonto = Math.abs(p.destinado - p.valor) < 1;
                return (
                  <div key={i} className={styles.filaPago}>
                    <div className={styles.pagoInfo}>
                      <span className={styles.mutedSmall}>{p.fecha ? formatFechaUTC(p.fecha) : 'Sin fecha'}</span>
                      {p.id && <span className={styles.pagoId}>Mov {p.id}</span>}
                    </div>
                    <div className={styles.pagoValor}>
                      <span className={`${styles.tabular} ${p.valor < 0 ? styles.textoPeligro : ''}`}>
                        {p.valor < 0 ? '-' : ''}{formatCOP(Math.abs(p.valor))}
                      </span>
                      {!mismoMonto && (
                        <span className={`${styles.notaDestinado} ${p.destinado < 0 ? styles.textoPeligroClaro : ''}`}>
                          destinado a esta cuota: {p.destinado < 0 ? '-' : ''}{formatCOP(Math.abs(p.destinado))}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ConciliacionSection({ negocio }) {
  const oportunidad = negocio.oportunidad;
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!oportunidad) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const resultado = await obtenerConciliacionCompleta(negocio);
        if (alive) setDatos(resultado);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidad?.id, negocio.id]);

  if (!oportunidad) return <p className={styles.sinDatosPad}>Sin oportunidad de Zoho vinculada a esta referencia.</p>;
  if (loading) return <p className={styles.cargando}>Cargando conciliación…</p>;
  if (error) return <p className={styles.error}>Error cargando la conciliación: {error}</p>;
  if (!datos.resumen) return <p className={styles.sinDatosPad}>La oportunidad vinculada no tiene plan de pagos registrado.</p>;

  const { cuotas, resumen } = datos;

  // Saldo inicial = la cuota inicial del plan: todas las cuotas menos el Saldo Contraentrega (la última).
  const cuotasIniciales = cuotas.slice(0, -1);
  const saldoInicial = cuotasIniciales.length > 0
    ? {
        valorPlan: cuotasIniciales.reduce((suma, c) => suma + c.valorPlan, 0),
        cubierto: cuotasIniciales.reduce((suma, c) => suma + c.cubierto, 0),
        fechaEstimada: cuotasIniciales[cuotasIniciales.length - 1].fechaEstimada,
      }
    : null;

  return (
    <div className={styles.seccionBody}>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <p className={styles.miniLabel}>Total plan</p>
          <p className={styles.kpiValor}>{formatCOP(resumen.totalPlan) ?? '—'}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.miniLabel}>Total pagado</p>
          <p className={`${styles.kpiValor} ${styles.textoExito}`}>
            {formatCOP(resumen.totalPagado) ?? '$ 0'} <span className={styles.kpiPorcentaje}>({resumen.porcentaje}%)</span>
          </p>
          {resumen.saldoAFavor > 0 && (
            <p className={`${styles.kpiSub} ${styles.textoExito}`}>Saldo a favor: {formatCOP(resumen.saldoAFavor)}</p>
          )}
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.miniLabel}>Cuotas pagadas</p>
          <p className={styles.kpiValor}>{resumen.cuotasPagadas}/{resumen.totalCuotas}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.miniLabel}>En mora</p>
          {resumen.cuotasEnMora > 0 ? (
            <p className={`${styles.kpiValor} ${styles.textoPeligro}`}>
              {resumen.cuotasEnMora} {resumen.cuotasEnMora === 1 ? 'cuota' : 'cuotas'}
              <span className={styles.kpiSub}>{formatCOP(resumen.montoEnMora) ?? '$ 0'}</span>
              <span className={styles.kpiSub}>{resumen.maxDiasAtraso} días</span>
            </p>
          ) : (
            <p className={styles.kpiValorVacio}>—</p>
          )}
        </div>
      </div>

      {(saldoInicial || resumen.saldoContraentrega) && (
        <div className={styles.saldosGrid}>
          {saldoInicial && (
            <div className={styles.card}>
              <p className={styles.miniLabel}>Saldo inicial</p>
              <div className={styles.filaEntreDos}>
                <div>
                  <p className={styles.kpiValor}>{formatCOP(saldoInicial.valorPlan) ?? '—'}</p>
                  {saldoInicial.cubierto > 0 && <p className={styles.notaAmbar}>Pagado: {formatCOP(saldoInicial.cubierto)}</p>}
                </div>
                <div className={styles.textoDerecha}>
                  {saldoInicial.fechaEstimada ? <p className={styles.dataText}>{formatFechaUTC(saldoInicial.fechaEstimada)}</p> : <p className={styles.vacio}>—</p>}
                  <p className={styles.mutedSmall}>Fecha esperada</p>
                </div>
              </div>
            </div>
          )}
          {resumen.saldoContraentrega && (
            <div className={styles.card}>
              <p className={styles.miniLabel}>Saldo Contraentrega</p>
              <div className={styles.filaEntreDos}>
                <div>
                  <p className={styles.kpiValor}>{formatCOP(resumen.saldoContraentrega.valorPlan) ?? '—'}</p>
                  {resumen.saldoContraentrega.cubierto > 0 && <p className={styles.notaAmbar}>Pagado: {formatCOP(resumen.saldoContraentrega.cubierto)}</p>}
                </div>
                <div className={styles.textoDerecha}>
                  {resumen.saldoContraentrega.fechaEstimada ? <p className={styles.dataText}>{formatFechaUTC(resumen.saldoContraentrega.fechaEstimada)}</p> : <p className={styles.vacio}>—</p>}
                  <p className={styles.mutedSmall}>Fecha esperada</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colChevron} />
              <th>Cuota</th>
              <th>Fecha esperada</th>
              <th>Fecha de pago</th>
              <th className={styles.right}>Valor de la cuota</th>
              <th className={styles.right}>Valor pagado</th>
              <th className={styles.right}>Diferencia</th>
              <th className={styles.right}>Días de atraso</th>
              <th className={styles.right}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cuotas.map((c, i) => <CuotaRow key={i} c={c} />)}
          </tbody>
        </table>
      </div>


      <p className={styles.aviso}>* Conciliación estimada según fechas calculadas, pagos aplicados y reversas (desistimientos y devoluciones). No representa un estado de cuenta oficial.</p>
    </div>
  );
}

// ── Contenido principal ──────────────────────────────────────────────────

export function NegocioDetalleContenido({ id }) {
  const [tab, setTab] = useState('resumen');
  const [negocio, setNegocio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getNegocio(id)
      .then((res) => setNegocio(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleExportarEstadoCuenta() {
    if (!negocio || exportando) return;
    setExportando(true);
    try {
      const datos = await obtenerConciliacionCompleta(negocio);
      if (!datos.resumen) {
        window.alert('Este negocio no tiene un plan de pagos registrado -- no se puede generar el estado de cuenta.');
        return;
      }
      await exportarEstadoCuenta(negocio, datos);
    } catch (err) {
      window.alert(`Error generando el estado de cuenta: ${err.message}`);
    } finally {
      setExportando(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.centrado}>
        <p className={styles.cargando}>Cargando…</p>
      </div>
    );
  }
  if (error || !negocio) {
    return (
      <div className={styles.centrado}>
        <p className={styles.error}>{error || 'Negocio no encontrado'}</p>
      </div>
    );
  }

  const { apto, financiero } = categorizeDatos(separarUnidadesAdicionales(filtrarDatosResumen(negocio.datos || {})));
  const aptoEntriesBase = negocio.datos ? Object.entries(apto) : categorizeInventarioDatos(negocio.inventarioDatos);
  const finEntries = ordenarFinanciero(Object.entries(financiero));

  const nomenclatura = negocio.datos?.Nomenclatura;
  // La tarjeta 'Total abonado' es el TOTAL PAGADO de la conciliación (suma de los movimientos), no el 'Saldo Actual' del Excel.
  const saldo = negocio.totalPagado ?? null;
  const saldoFmt = saldo != null ? (formatCOP(saldo) ?? '$ 0') : null;

  const fideicomisoRaw = negocio.datos?.Fideicomiso || '';
  const codigoMatch = String(fideicomisoRaw).match(/^(\d+)/);
  const proyectoInfo = codigoMatch ? obtenerProyecto(codigoMatch[1]) : null;

  const pisoRaw = negocio.oportunidad?.seccionInmueble?.Piso || negocio.oportunidad?.seccionInmueble?.Piso_Lista || null;
  const pisoInfo = desglosarPiso(pisoRaw);

  const aptoEntries = [
    ...(proyectoInfo?.etapa ? [['Etapa', proyectoInfo.etapa]] : []),
    ...(negocio.codigoInmueble ? [['Código de Inmueble', negocio.codigoInmueble]] : []),
    ...(negocio.nomenclaturaCompleta ? [['Nomenclatura completa', negocio.nomenclaturaCompleta]] : []),
    ...aptoEntriesBase,
  ];


  return (
    <div className={styles.detalle}>
      <DetalleHero
        icon={Briefcase}
        titulo={negocio.referencia || negocio.nomenclaturaCompleta || '—'}
        subtitulo={negocio.referencia && (negocio.nomenclaturaCompleta || nomenclatura || proyectoInfo?.etapa || pisoInfo) ? (
          negocio.nomenclaturaCompleta ? (
            <span>{negocio.nomenclaturaCompleta}</span>
          ) : (
            <>
              {nomenclatura && <span>Apto {nomenclatura}</span>}
              {nomenclatura && (proyectoInfo?.etapa || pisoInfo) && <span className={styles.puntoSep}>·</span>}
              {proyectoInfo?.etapa && <span>Etapa {proyectoInfo.etapa}</span>}
              {proyectoInfo?.etapa && pisoInfo && <span className={styles.puntoSep}>·</span>}
              {pisoInfo?.torre && <span>Torre {pisoInfo.torre}</span>}
              {pisoInfo?.torre && pisoInfo?.piso && <span className={styles.puntoSep}>·</span>}
              {pisoInfo?.piso && <span>Piso {pisoInfo.piso}</span>}
            </>
          )
        ) : (negocio.referencia ? 'Referencia' : 'Nomenclatura completa')}
        meta={`${negocio.totalMovimientos} movimientos`}
      >
        <HeroBadges>
          {negocio.estado && <EstadoFiduciaBadge estado={negocio.estado} />}
          {!negocio.tieneNegocio && <Badge variant="neutral">Sin negocio</Badge>}
          {negocio.oportunidad && (
            <HeroBoton onClick={handleExportarEstadoCuenta} disabled={exportando} title="Exportar estado de cuenta (PDF)">
              {exportando ? 'Generando…' : 'Estado de cuenta'}
            </HeroBoton>
          )}
        </HeroBadges>
        {saldoFmt && <HeroSaldo valor={saldoFmt} positivo={saldo > 0} />}
      </DetalleHero>

      <Vinculados proyecto="baia" tipo="negocio" id={id} />

      <Tabs
        ariaLabel="Secciones del negocio"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'financiero', label: 'Financiero' },
          { key: 'conciliacion', label: 'Conciliación' },
          { key: 'movimientos', label: 'Movimientos', badge: negocio.totalMovimientos },
        ]}
      />

      {tab === 'resumen' && (
        <>
      <Accordion collapsible={false} title="Comprador" badge={negocio.compradores?.length}>
        {negocio.compradores && negocio.compradores.length > 0 ? (
          <div className={styles.listaCompradores}>
            {negocio.compradores.map((c, i) => {
              const nombre = limpiarNombreComprador(c.nombre);
              return (
                <div key={c.id ?? i} className={styles.filaComprador}>
                  <div className={styles.avatar}>{nombre.charAt(0).toUpperCase()}</div>
                  <div className={styles.compradorInfo}>
                    <p className={styles.compradorNombre}>{nombre}</p>
                    {(c.nro_id ?? c.nroId) && <p className={styles.mutedSmall}>C.C. {c.nro_id ?? c.nroId}</p>}
                  </div>
                  {c.porcentaje != null && <span className={styles.compradorPct}>{c.porcentaje}%</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.sinDatosPad}>Sin compradores registrados</p>
        )}
      </Accordion>
      <Accordion collapsible={false} title="Info del apartamento" badge={aptoEntries.length}>
        {aptoEntries.length > 0 ? <ListaInfo entries={aptoEntries} hoja="resumen" format={formatCell} /> : <p className={styles.sinDatosPad}>Sin datos del apartamento</p>}
      </Accordion>
        </>
      )}

      {tab === 'financiero' && (
        <>
      <Accordion collapsible={false} title="Estructura financiera y abonos" badge={finEntries.length}>
        {finEntries.length > 0 ? <ListaFinanciera entries={finEntries} format={formatCell} /> : <p className={styles.sinDatosPad}>Sin datos financieros en este archivo</p>}
      </Accordion>
      <Accordion collapsible={false} title="Forma y propuesta de pago">
        {negocio.oportunidad ? <PlanDePagosZoho oportunidad={negocio.oportunidad} /> : <p className={styles.sinDatosPad}>Sin oportunidad de Zoho vinculada a esta referencia.</p>}
      </Accordion>
        </>
      )}

      {tab === 'conciliacion' && (
        <>
      <Accordion collapsible={false} title="Conciliación">
        <ConciliacionSection key={id} negocio={negocio} />
      </Accordion>
        </>
      )}

      {tab === 'movimientos' && (
        <>
      <Accordion collapsible={false} title="Historial de movimientos" badge={negocio.totalMovimientos}>
        <MovimientosSection key={id} id={id} />
      </Accordion>
        </>
      )}
    </div>
  );
}
