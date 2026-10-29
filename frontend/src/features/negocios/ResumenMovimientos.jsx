// Resumen del historial de movimientos de un negocio: el TOTAL MOVIMIENTOS (suma de la columna Valor de todos los
// movimientos, no solo de la página que se ve) con su contexto real -- cuánto entra, cuánto sale y el último movimiento.
// Los datos los arma el backend (`resumen` de getMovimientos); aquí no se calcula nada.
import { ArrowDownLeft, ArrowUpRight, CalendarClock } from 'lucide-react';
import { InfoTooltip } from '../../components/ui/InfoTooltip.jsx';
import { formatCOP } from '../fiducia/MovimientosTabla.jsx';
import { formatFechaUTC } from '../../utils/planDePagos.js';
import styles from './ResumenMovimientos.module.css';

const fecha = (iso) => (iso ? formatFechaUTC(new Date(iso)) : null);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export function ResumenMovimientos({ resumen, totalMovimientos }) {
  if (!resumen) return null;
  const { total, ingresos, egresos, nIngresos, nEgresos, desde, hasta, ultimoValor } = resumen;
  const salidas = Math.abs(egresos);
  const movido = ingresos + salidas;
  const pctEntra = movido > 0 ? (ingresos / movido) * 100 : 100;
  const rango = desde && hasta ? (fecha(desde) === fecha(hasta) ? fecha(hasta) : `${fecha(desde)} – ${fecha(hasta)}`) : null;

  return (
    <section className={styles.resumen} aria-label="Resumen del historial de movimientos">
      <div className={styles.principal}>
        <p className={styles.etiqueta}>
          Total movimientos
          <InfoTooltip
            titulo="Total movimientos"
            text="Suma de la columna Valor de todos los movimientos del negocio, tal como aparecen en el historial. Puede diferir del Total pagado de la conciliación, que descarta los movimientos de venta y los anteriores a un desistimiento."
          />
        </p>
        <p className={styles.total}>{formatCOP(total) ?? '$ 0'}</p>
        <p className={styles.meta}>
          {plural(totalMovimientos ?? nIngresos + nEgresos, 'movimiento', 'movimientos')}
          {rango && <span className={styles.rango}>{rango}</span>}
        </p>
        {egresos < 0 && (
          <div className={styles.barra} role="img" aria-label={`${Math.round(pctEntra)}% de lo movido entra y ${Math.round(100 - pctEntra)}% sale`}>
            <span className={styles.barraEntra} style={{ width: `${pctEntra}%` }} />
          </div>
        )}
      </div>

      <dl className={styles.datos}>
        <div className={styles.dato}>
          <dt className={styles.datoEtiqueta}>
            <span className={`${styles.icono} ${styles.iconoEntra}`}><ArrowDownLeft size={15} strokeWidth={2} aria-hidden="true" /></span>
            Entra
          </dt>
          <dd className={styles.datoValor}>{formatCOP(ingresos) ?? '$ 0'}</dd>
          <dd className={styles.datoSub}>{plural(nIngresos, 'movimiento', 'movimientos')}</dd>
        </div>

        <div className={styles.dato}>
          <dt className={styles.datoEtiqueta}>
            <span className={`${styles.icono} ${styles.iconoSale}`}><ArrowUpRight size={15} strokeWidth={2} aria-hidden="true" /></span>
            Sale
          </dt>
          <dd className={styles.datoValor}>{egresos < 0 ? formatCOP(salidas) : <span className={styles.vacio}>Sin salidas</span>}</dd>
          <dd className={styles.datoSub}>{egresos < 0 ? plural(nEgresos, 'movimiento', 'movimientos') : ' '}</dd>
        </div>

        <div className={styles.dato}>
          <dt className={styles.datoEtiqueta}>
            <span className={`${styles.icono} ${styles.iconoFecha}`}><CalendarClock size={15} strokeWidth={2} aria-hidden="true" /></span>
            Último movimiento
          </dt>
          <dd className={styles.datoValor}>{hasta ? fecha(hasta) : <span className={styles.vacio}>—</span>}</dd>
          <dd className={styles.datoSub}>{ultimoValor != null ? formatCOP(ultimoValor) : ' '}</dd>
        </div>
      </dl>
    </section>
  );
}
