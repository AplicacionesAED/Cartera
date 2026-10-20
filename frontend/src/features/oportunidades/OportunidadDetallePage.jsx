// Adaptado de zoho-payment-tracker/frontend/src/pages/OpportunityDetail.jsx --
// mismo layout de 2 columnas (Información general + Inmueble a la
// izquierda; Plan de Pagos + Cotización + Forma/Propuesta de Pago a la
// derecha), traducción de nombres crudos de campo de Zoho a etiquetas en
// español vía /oportunidades/campos/metadata, y el acordeón de subforms con
// carga diferida (solo pide Forma/Propuesta de Pago -- que puede caer a un
// fallback lento contra Zoho si el sync masivo no las trajo -- la primera
// vez que se abre, no en cada visita a la página).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Vinculados } from '../../components/Vinculados.jsx';
import { StageBadge } from '../../components/ui/StageBadge.jsx';
import { Accordion } from '../../components/ui/Accordion.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { getOportunidad, getSubformsOportunidad, refrescarSubformsOportunidad, getCamposMetadata } from '../../api/oportunidades.js';
import { Button } from '../../components/ui/Button.jsx';
import { RefreshCw } from 'lucide-react';
import { formatCOP, formatDate, formatDateTime } from '../../utils/format.js';
import { addFechaEstimada } from '../../utils/planDePagos.js';
import layoutStyles from '../../components/layout/WizardLayout.module.css';
import styles from './OportunidadDetallePage.module.css';

function iniciales(texto = '') {
  const partes = String(texto).replace(/^(Baia Kristal|Oliv)\s*-\s*/i, '').trim().split(/\s+/).filter(Boolean);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? partes[1][0] : ''}`.toUpperCase() || '?';
}


function InfoRow({ label, children }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.miniLabel}>{label}</span>
      <div className={styles.infoValor}>{children || '—'}</div>
    </div>
  );
}

function FieldGrid({ data, fieldMap }) {
  if (!data) return null;
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return <p className={styles.sinDatos}>Sin datos disponibles</p>;

  return (
    <div className={styles.fieldGrid}>
      {entries.map(([key, value]) => {
        const label = fieldMap[key] || key;
        let displayValue;
        if (typeof value === 'object' && value !== null) displayValue = value.name || value.display_value || JSON.stringify(value);
        else displayValue = String(value);
        return (
          <div key={key} className={styles.fieldCell}>
            <span className={styles.miniLabel}>{label}</span>
            <span className={styles.fieldValor}>{displayValue || '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

function parseAmt(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return NaN;
  return parseFloat(s.replace(/[^0-9-]/g, ''));
}

function SubformTable({ rows }) {
  if (!rows || rows.length === 0) return <p className={styles.sinDatos}>Sin datos registrados</p>;

  const SKIP_KEYS = ['id', 'Created_Time', 'Modified_Time', '$line_tax', '$permissions', 'Owner'];
  const allKeys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP_KEYS.includes(k));
  if (allKeys.length === 0) return <p className={styles.sinDatos}>Sin datos registrados</p>;

  const toLabel = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const moneyKeys = allKeys.filter((k) => rows.some((row) => { const n = parseAmt(row[k]); return !isNaN(n) && n >= 1000; }));
  const filterKeys = moneyKeys.length > 0 ? moneyKeys : null;
  const visibleRows = rows.filter((row) => !filterKeys || filterKeys.some((k) => { const n = parseAmt(row[k]); return !isNaN(n) && n !== 0; }));

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>{allKeys.map((key) => <th key={key}>{toLabel(key)}</th>)}</tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={i}>
              {allKeys.map((key) => {
                const val = row[key];
                let display = '—';
                if (val != null && val !== '') {
                  if (typeof val === 'object') display = val.name || val.display_value || JSON.stringify(val);
                  else if (typeof val === 'number') display = formatCOP(val);
                  else display = String(val);
                }
                return <td key={key}>{display}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubformsSection({ oportunidadId, fechaInicioPlanPagos }) {
  const [subforms, setSubforms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  async function actualizarDesdeZoho() {
    setActualizando(true);
    setMensaje(null);
    try {
      const res = await refrescarSubformsOportunidad(oportunidadId);
      setSubforms(res.data || { formaPago: [], propuestaPago: [] });
      setMensaje({ ok: true, texto: 'Plan de pagos actualizado desde Zoho.' });
    } catch (err) {
      setMensaje({ ok: false, texto: err.message || 'No se pudo actualizar desde Zoho.' });
    } finally {
      setActualizando(false);
    }
  }

  useEffect(() => {
    let alive = true;
    getSubformsOportunidad(oportunidadId)
      .then((res) => { if (alive) setSubforms(res.data || { formaPago: [], propuestaPago: [] }); })
      .catch(() => { if (alive) setSubforms({ formaPago: [], propuestaPago: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [oportunidadId]);

  if (loading) return <p className={styles.cargando}>Cargando desde Zoho...</p>;

  const forma = addFechaEstimada(subforms.formaPago, fechaInicioPlanPagos);

  return (
    <div className={styles.seccionBody}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={actualizarDesdeZoho} disabled={actualizando}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={14} aria-hidden="true" />
            {actualizando ? 'Actualizando…' : 'Actualizar desde Zoho'}
          </span>
        </Button>
        {mensaje && <span style={{ fontSize: 'var(--text-data-size)', color: mensaje.ok ? 'var(--color-success, #15803d)' : 'var(--color-danger, #b91c1c)' }}>{mensaje.texto}</span>}
      </div>
      <div>
        <p className={styles.subtitulo}>Forma de Pago</p>
        <SubformTable rows={forma} />
        {fechaInicioPlanPagos && subforms.formaPago?.length > 0 && (
          <p className={styles.aviso}>* Fechas estimadas con periodicidad mensual desde la fecha de separación. No representan fechas contractuales.</p>
        )}
      </div>
      <div>
        <p className={styles.subtitulo}>Propuesta de Pago</p>
        <SubformTable rows={subforms.propuestaPago} />
      </div>
    </div>
  );
}

export function OportunidadDetallePage() {
  const { id } = useParams();
  const [tab, setTab] = useState('resumen');
  const [op, setOp] = useState(null);
  const [fieldMap, setFieldMap] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    Promise.all([getOportunidad(id), getCamposMetadata()])
      .then(([opRes, camposRes]) => {
        setOp(opRes.data);
        const map = {};
        camposRes.data.forEach((f) => { map[f.apiName] = f.fieldLabel; });
        setFieldMap(map);
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [id]);

  if (cargando) return <p className={styles.cargando}>Cargando…</p>;
  if (error || !op) return <p className={styles.error}>{error || 'Oportunidad no encontrada'}</p>;

  const camposFinancieros = Object.entries(op.camposFinancieros ?? {}).filter(([, value]) => {
    if (value == null || value === '') return false;
    const n = parseFloat(value);
    return isNaN(n) || n !== 0;
  });

  // Cifras clave arriba: se eligen del plan de pagos por su etiqueta (los nombres
  // de campo de Zoho son crudos), solo si vienen con valor.
  const kpis = [
    ['Valor final de la negociación', /valor final/i],
    ['Cuota inicial', /cuota inicial/i],
    ['Saldo contra entrega', /saldo contra/i],
  ]
    .map(([label, patron]) => {
      const par = camposFinancieros.find(([key]) => patron.test(fieldMap[key] || key));
      return par ? [label, par[1]] : null;
    })
    .filter(Boolean);

  return (
    <div className={styles.page}>
      <BackLink to="/oportunidades">Oportunidades</BackLink>

      <section className={layoutStyles.hero}>
        <div className={layoutStyles.heroAvatar}>{iniciales(op.contactName || op.dealName)}</div>
        <div className={layoutStyles.heroInfo}>
          <h1 className={layoutStyles.heroName}>{op.dealName}</h1>
          <p className={layoutStyles.heroRole}>{[op.contactName, op.accountName].filter(Boolean).join(' · ') || 'Oportunidad'}</p>
          <p className={layoutStyles.heroMeta}>Última sincronización: {formatDateTime(op.ultimoSyncEn)}</p>
        </div>
        <div className={layoutStyles.heroSide}>
          <StageBadge stage={op.stage} />
          {op.referenciaRecaudo && <span className={styles.refBadge}>Ref. {op.referenciaRecaudo}</span>}
        </div>
      </section>

      <Vinculados proyecto="baia" tipo="oportunidad" id={id} />

      {kpis.length > 0 && (
        <div className={styles.kpiGrid}>
          {kpis.map(([label, valor]) => (
            <div key={label} className={styles.kpiCard}>
              <p className={styles.kpiLabel}>{label}</p>
              <p className={styles.kpiValor}>{formatCOP(valor)}</p>
            </div>
          ))}
        </div>
      )}

      <Tabs
        ariaLabel="Secciones de la oportunidad"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'pagos', label: 'Plan de pagos' },
          ...(op.seccionCotizacion && Object.keys(op.seccionCotizacion).length > 0 ? [{ key: 'cotizacion', label: 'Cotización' }] : []),
        ]}
      />

      {tab === 'resumen' && (
        <div className={styles.body}>
          <div className={styles.card}>
            <p className={styles.subtitulo}>Información general</p>
            <InfoRow label="Contacto">{op.contactName}</InfoRow>
            <InfoRow label="Email">{op.contactEmail ? <a href={`mailto:${op.contactEmail}`} className={styles.link}>{op.contactEmail}</a> : null}</InfoRow>
            <InfoRow label="Teléfono">{op.contactPhone ? <a href={`tel:${op.contactPhone}`} className={styles.link}>{op.contactPhone}</a> : null}</InfoRow>
            <InfoRow label="Empresa / Proyecto">{op.accountName}</InfoRow>
            <InfoRow label="Pago Separación"><span className={styles.link}>{formatDate(op.pagoSeparacion)}</span></InfoRow>
            <InfoRow label="Referencia Recaudo">{op.referenciaRecaudo ? <span className={styles.refBadge}>{op.referenciaRecaudo}</span> : null}</InfoRow>
          </div>

          {op.seccionInmueble && Object.keys(op.seccionInmueble).length > 0 && (
            <div className={styles.card}>
              <p className={styles.subtitulo}>Inmueble</p>
              <FieldGrid data={op.seccionInmueble} fieldMap={fieldMap} />
            </div>
          )}
        </div>
      )}

      {tab === 'pagos' && (
        <div className={styles.columna}>
          <div className={styles.card}>
            <p className={styles.subtitulo}>Plan de Pagos</p>
            {camposFinancieros.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Campo</th><th className={styles.right}>Valor</th></tr></thead>
                  <tbody>
                    {camposFinancieros.map(([key, value]) => (
                      <tr key={key}>
                        <td>{fieldMap[key] || key}</td>
                        <td className={`${styles.right} ${styles.montoFuerte}`}>{formatCOP(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.sinDatos}>Sin datos financieros</p>
            )}
          </div>

          <Accordion collapsible={false} title="Forma y Propuesta de Pago">
            <SubformsSection oportunidadId={id} fechaInicioPlanPagos={op.fechaInicioPlanPagos} />
          </Accordion>
        </div>
      )}

      {tab === 'cotizacion' && op.seccionCotizacion && Object.keys(op.seccionCotizacion).length > 0 && (
        <div className={styles.card}>
          <p className={styles.subtitulo}>Cotización</p>
          <FieldGrid data={op.seccionCotizacion} fieldMap={fieldMap} />
        </div>
      )}
    </div>
  );
}
