// Tabla de movimientos fiduciarios compartida: la usan el módulo general de Movimientos
// (MovimientosPage) y la pestaña Movimientos del detalle de un negocio, para que ambas se
// vean idénticas (mismas columnas, misma fila expandible con todos los campos).
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ConceptoHint } from '../../components/ui/ConceptoHint.jsx';
import { formatExcelDate } from '../../utils/format.js';
import { filtrarKeysMovimiento } from '../../utils/columnasExcluidas.js';
import { etiquetaCampoMovimiento, valorCampoMovimiento } from '../../utils/movimientoCampos.js';
import base from '../negocios/NegociosPage.module.css';
import styles from './MovimientosPage.module.css';

export function formatCOP(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return null;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

export function formatCell(key, value) {
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

export function cleanNombre(nombre) {
  if (!nombre) return null;
  return nombre.replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '');
}

export function shortFideicomiso(raw) {
  if (!raw) return null;
  return String(raw).replace(/^\d+[\s-]+/, '').replace(/^P\.?A\.?\s*/i, '').trim();
}

function iniciales(nombre = '') {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? partes[partes.length - 1][0] : ''}`.toUpperCase() || '?';
}

export function MovimientoRow({ mov }) {
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
          {neg?.enlaceId ? (
            <Link to={`/negocios/${neg.enlaceId}`} className={styles.referencia} onClick={(e) => e.stopPropagation()} title="Abrir el negocio">{mov.referencia}</Link>
          ) : (
            <span className={styles.referencia}>{mov.referencia}</span>
          )}
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
          <div className={base.celdaTitulo}>
            <span className={base.nombre}>{neg?.nomenclatura ?? '—'}</span>
            {proyecto && <span className={base.detalleSec}>{proyecto}</span>}
          </div>
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

export function MovimientosTabla({ movimientos }) {
  return (
    <table className={base.table}>
      <thead>
        <tr>
          <th className={styles.chevronCol} />
          <th><span>Fecha<ConceptoHint columna="Fecha Contable" hoja="movimiento" /></span></th>
          <th><span>Referencia de recaudo</span></th>
          <th><span>Comprador<ConceptoHint columna="Propietario" hoja="movimiento" /></span></th>
          <th><span>Unidad<ConceptoHint columna="Nomenclatura" hoja="movimiento" /></span></th>
          <th><span>Tipo de movimiento<ConceptoHint columna="Tipo Movimiento" hoja="movimiento" /></span></th>
          <th className={base.derecha}><span>Valor<ConceptoHint columna="Valor" hoja="movimiento" /></span></th>
        </tr>
      </thead>
      <tbody>
        {movimientos.map((mov) => <MovimientoRow key={mov.id} mov={mov} />)}
      </tbody>
    </table>
  );
}
