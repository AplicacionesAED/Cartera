// Adaptado de zoho-payment-tracker/frontend/src/pages/ApartamentoDetalle.jsx
// -- mismas 4 secciones acordeón que la variante de Negocios (Comprador/
// Info del apartamento/Estructura financiera/Historial de movimientos), sin
// Conciliación ni Plan de pagos (acá no hay una Oportunidad de Zoho
// vinculada, es una unidad vista desde el lado de Fiducia). La fila de
// movimiento acá SÍ trae una columna "Estado" (Aplicado/Pendiente/
// Reversado) que la de Negocios no tiene.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Accordion } from '../../components/ui/Accordion.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { ConceptoHint } from '../../components/ui/ConceptoHint.jsx';
import { ListaInfo, ListaFinanciera } from '../../components/ui/DatosFinancieros.jsx';
import { getApartamentoDetalle } from '../../api/fiducia.js';
import { filtrarDatosResumen, filtrarKeysMovimiento } from '../../utils/columnasExcluidas.js';
import { ordenarFinanciero } from '../../utils/ordenColumnas.js';
import { estadoToken } from '../../utils/estados.js';
import { separarUnidadesAdicionales } from '../../utils/unidadesAdicionales.js';
import { formatExcelDate } from '../../utils/format.js';
import styles from './ApartamentoDetallePage.module.css';
import { DetalleHero, HeroBadges, HeroSaldo } from '../../components/layout/DetalleHero.jsx';
import { Building2 } from 'lucide-react';
import { etiquetaCampoMovimiento, valorCampoMovimiento } from '../../utils/movimientoCampos.js';

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
  'nomenclatura', 'area', 'área', 'm2', 'm²', 'tipo inmueble', 'categoria', 'categoría',
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

function limpiarNombreComprador(nombre) {
  return String(nombre || '').replace(/^\|+\s*/, '').replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '');
}

function estadoMovimientoVariant(estado) {
  if (!estado) return null;
  const e = estado.toLowerCase();
  if (e.includes('aplicado')) return 'success';
  if (e.includes('pendiente') || e.includes('reversado')) return 'warning';
  return 'neutral';
}

function MovimientoRow({ mov, fields }) {
  const [expanded, setExpanded] = useState(false);
  const datos = mov.datos || {};
  const fecha = datos['Fecha Contable'] ? formatExcelDate(datos['Fecha Contable']) : null;
  const tipo = datos['Tipo Movimiento'] || datos['Concepto'] || null;
  const valor = datos['Valor'] ? formatCOP(datos['Valor']) : null;
  const estado = datos['Estado'];

  return (
    <>
      <tr className={styles.filaClicable} onClick={() => setExpanded((e) => !e)}>
        <td className={styles.colChevron}>
          <svg className={`${styles.chevronRow} ${expanded ? styles.chevronRowOpen : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </td>
        <td className={styles.nowrap}>{fecha ?? <span className={styles.vacio}>—</span>}</td>
        <td className={styles.truncCell}>{tipo ?? <span className={styles.vacio}>—</span>}</td>
        <td className={`${styles.nowrap} ${styles.right} ${styles.strong}`}>{valor ?? <span className={styles.vacio}>—</span>}</td>
        <td className={`${styles.nowrap} ${styles.right}`}>{estado && <Badge variant={estadoMovimientoVariant(estado)}>{estado}</Badge>}</td>
      </tr>
      {expanded && (
        <tr className={styles.filaExpandida}>
          <td colSpan={5}>
            <div className={styles.gridExpandido}>
              {fields.map((col) => {
                const v = valorCampoMovimiento(col, datos[col]);
                const display = v != null && v !== '' ? (formatCell(col, v) ?? String(v)) : null;
                return (
                  <div key={col}>
                    <p className={styles.miniLabel}>
                      {etiquetaCampoMovimiento(col)}
                      <ConceptoHint columna={col} hoja="movimiento" />
                    </p>
                    <p className={styles.miniValor}>{display ?? <span className={styles.vacio}>—</span>}</p>
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

export function ApartamentoDetallePage() {
  const { id, referencia: rawRef } = useParams();
  const [tab, setTab] = useState('resumen');
  const referencia = decodeURIComponent(rawRef);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setCargando(true);
    getApartamentoDetalle(id, referencia)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [id, referencia]);

  if (cargando) return <p className={styles.cargando}>Cargando…</p>;
  if (error || !data) return <p className={styles.error}>{error || 'No encontrado'}</p>;

  const { negocio, movimientos, totalMovimientos, encargo } = data;
  const { apto, financiero } = categorizeDatos(separarUnidadesAdicionales(filtrarDatosResumen(negocio.datos || {})));
  const aptoEntries = Object.entries(apto);
  const finEntries = ordenarFinanciero(Object.entries(financiero));

  const saldo = negocio.saldoActual ?? null;
  const saldoFmt = saldo != null ? formatCOP(saldo) : null;
  const movFields = movimientos.length > 0 ? filtrarKeysMovimiento(Object.keys(movimientos[0].datos || {})) : [];
  const estadoVariant = estadoToken(negocio.estado);

  return (
    <div className={styles.page}>
      <BackLink to={`/fiducia/${id}`}>{encargo?.nombre ?? 'Encargo'}</BackLink>

      <DetalleHero
        icon={Building2}
        titulo={negocio.referencia}
        subtitulo={(negocio.datos?.Nomenclatura || negocio.datos?.Inventario) ? (
          <>
            {negocio.datos.Nomenclatura && <span>Apto {negocio.datos.Nomenclatura}</span>}
            {negocio.datos.Nomenclatura && negocio.datos.Inventario && <span className={styles.puntoSep}>·</span>}
            {negocio.datos.Inventario && <span>{negocio.datos.Inventario}</span>}
          </>
        ) : 'Referencia'}
        meta={`${totalMovimientos} movimientos`}
      >
        <HeroBadges>
          {negocio.estado && <Badge variant={estadoVariant}>{negocio.estado}</Badge>}
        </HeroBadges>
        {saldoFmt && <HeroSaldo valor={saldoFmt} positivo={saldo > 0} />}
      </DetalleHero>

      <Tabs
        ariaLabel="Secciones de la unidad"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'financiero', label: 'Financiero' },
          { key: 'movimientos', label: 'Movimientos', badge: totalMovimientos },
        ]}
      />

      {tab === 'resumen' && (
        <>
      <Accordion collapsible={false} title="Comprador" badge={negocio.compradores?.length}>
        {negocio.compradores?.length > 0 ? (
          <div className={styles.listaCompradores}>
            {negocio.compradores.map((c, i) => {
              const nombre = limpiarNombreComprador(c.nombre);
              return (
                <div key={c.id ?? i} className={styles.filaComprador}>
                  <div className={styles.avatar}>{nombre?.charAt(0).toUpperCase() ?? '?'}</div>
                  <div className={styles.compradorInfo}>
                    <p className={styles.compradorNombre}>{nombre}</p>
                    {(c.nro_id ?? c.nroId) && <p className={styles.mutedSmall}>{c.nro_id ?? c.nroId}</p>}
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
        {finEntries.length > 0 ? <ListaFinanciera entries={finEntries} format={formatCell} /> : <p className={styles.sinDatosPad}>Sin datos financieros</p>}
      </Accordion>
        </>
      )}

      {tab === 'movimientos' && (
        <>
      <Accordion collapsible={false} title="Historial de movimientos" badge={totalMovimientos}>
        {movimientos.length === 0 ? (
          <p className={styles.sinDatosPad}>Sin movimientos registrados</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colChevron} />
                  <th><span className={styles.thConcepto}>Fecha<ConceptoHint columna="Fecha Contable" hoja="movimiento" /></span></th>
                  <th><span className={styles.thConcepto}>Tipo movimiento<ConceptoHint columna="Tipo Movimiento" hoja="movimiento" /></span></th>
                  <th className={styles.right}><span className={styles.thConcepto}>Valor<ConceptoHint columna="Valor" hoja="movimiento" /></span></th>
                  <th className={styles.right}><span className={styles.thConcepto}>Estado<ConceptoHint columna="Estado" hoja="movimiento" /></span></th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((mov) => <MovimientoRow key={mov.id} mov={mov} fields={movFields} />)}
              </tbody>
            </table>
          </div>
        )}
      </Accordion>
        </>
      )}
    </div>
  );
}
