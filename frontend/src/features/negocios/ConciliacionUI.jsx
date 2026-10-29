// Piezas visuales de la Conciliación de un negocio, compartidas por la conciliación con plan de pagos y la genérica (sin plan):
//  - BarraProgreso: cuánto se lleva pagado de un valor.
//  - ConciliacionHero: el avance general (pagado contra el total) con los datos que lo explican.
//  - HitoCard: un tramo del pago (Saldo inicial / Saldo contraentrega, o Cuota inicial / Crédito) con su propio avance.
// Todo llega ya calculado; aquí solo se dibuja.
import { AlertTriangle, CheckCircle2, Hourglass } from 'lucide-react';
import { Badge } from '../../components/ui/Badge.jsx';
import { InfoTooltip } from '../../components/ui/InfoTooltip.jsx';
import { formatCOP } from '../fiducia/MovimientosTabla.jsx';
import { formatFechaUTC } from '../../utils/planDePagos.js';
import styles from './Conciliacion.module.css';

const pct = (parte, total) => (total > 0 ? Math.max(0, Math.min(100, (parte / total) * 100)) : 0);

export function BarraProgreso({ pagado, total, etiqueta, compacta = false }) {
  const p = pct(pagado, total);
  const completa = total > 0 && pagado >= total - 1;
  return (
    <div
      className={`${styles.barra} ${compacta ? styles.barraCompacta : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p)}
      aria-label={etiqueta}
    >
      <span className={`${styles.barraRelleno} ${completa ? styles.barraCompleta : ''}`} style={{ width: `${p}%` }} />
    </div>
  );
}

export function ConciliacionHero({ etiquetaTotal, total, infoTotal, pagado, saldoAFavor, pendiente, datos = [] }) {
  const porcentaje = total > 0 ? Math.round((pagado / total) * 100) : null;
  return (
    <section className={styles.hero} aria-label="Avance del pago">
      <div className={styles.heroPrincipal}>
        <p className={styles.heroEtiqueta}>Total pagado</p>
        <p className={styles.heroValor}>{formatCOP(pagado) ?? '$ 0'}</p>
        <p className={styles.heroMeta}>
          {porcentaje != null && <strong>{porcentaje}%</strong>}
          {total != null && (
            <span>
              {porcentaje != null ? ' de ' : 'De '}{etiquetaTotal.toLowerCase()} <strong>{formatCOP(total)}</strong>
              {infoTotal && <InfoTooltip titulo={etiquetaTotal} text={infoTotal} />}
            </span>
          )}
        </p>
        <BarraProgreso pagado={pagado} total={total} etiqueta={`Avance del pago: ${porcentaje ?? 0}%`} />
        {saldoAFavor > 0 && (
          <p className={styles.heroFavor}><CheckCircle2 size={14} aria-hidden="true" /> Saldo a favor: {formatCOP(saldoAFavor)}</p>
        )}
      </div>

      <dl className={styles.heroDatos}>
        <div className={styles.heroDato}>
          <dt><Hourglass size={14} aria-hidden="true" /> Pendiente por pagar</dt>
          <dd>{pendiente != null ? formatCOP(pendiente) : '—'}</dd>
        </div>
        {datos.map((d) => (
          <div key={d.etiqueta} className={styles.heroDato}>
            <dt>
              {d.alerta ? <AlertTriangle size={14} aria-hidden="true" className={styles.iconoAlerta} /> : <CheckCircle2 size={14} aria-hidden="true" />}
              {d.etiqueta}
            </dt>
            <dd className={d.alerta ? styles.textoAlerta : ''}>{d.valor}</dd>
            {d.sub && <dd className={styles.heroSub}>{d.sub}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

// Estado de un tramo: completo, parcial, pendiente o vencido (si su fecha ya pasó y no está completo).
function estadoHito({ valor, pagado, fecha }) {
  if (valor > 0 && pagado >= valor - 1) return { txt: 'Pagado', variant: 'success' };
  const vencido = fecha && new Date(fecha) < new Date();
  if (vencido) return { txt: 'Vencido', variant: 'danger' };
  if (pagado > 0) return { txt: 'Parcial', variant: 'warning' };
  return { txt: 'Pendiente', variant: 'neutral' };
}

export function HitoCard({ titulo, subtitulo, valor, pagado, fecha, textoFecha = 'Fecha esperada' }) {
  const estado = estadoHito({ valor, pagado, fecha });
  const falta = Math.max(0, (valor ?? 0) - pagado);
  return (
    <article className={styles.hito}>
      <header className={styles.hitoCabecera}>
        <div>
          <h4 className={styles.hitoTitulo}>{titulo}</h4>
          {subtitulo && <p className={styles.hitoSubtitulo}>{subtitulo}</p>}
        </div>
        <Badge variant={estado.variant}>{estado.txt}</Badge>
      </header>

      <p className={styles.hitoValor}>{formatCOP(valor) ?? '—'}</p>
      <BarraProgreso pagado={pagado} total={valor} etiqueta={`${titulo}: ${Math.round(pct(pagado, valor))}% pagado`} compacta />

      <dl className={styles.hitoDatos}>
        <div>
          <dt>Pagado</dt>
          <dd className={pagado > 0 ? styles.textoExito : ''}>{formatCOP(pagado) ?? '$ 0'}</dd>
        </div>
        <div>
          <dt>Falta</dt>
          <dd>{formatCOP(falta) ?? '$ 0'}</dd>
        </div>
        <div>
          <dt>{textoFecha}</dt>
          <dd>{fecha ? formatFechaUTC(new Date(fecha)) : '—'}</dd>
        </div>
      </dl>
    </article>
  );
}
