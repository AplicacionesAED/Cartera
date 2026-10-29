// Conciliación genérica para un negocio que no tiene plan de pagos en Zoho (sin oportunidad vinculada, o con una oportunidad
// sin plan): no hay cuotas que conciliar, pero la fiducia sí trae el valor de venta, la cuota inicial y los pagos. Se muestra
// lo que se puede decir con eso -- cuánto vale, cuánto se ha pagado, cuánto falta y el detalle de los pagos --, con las mismas
// reglas de pagos de la conciliación normal (sin el asiento de venta).
import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { getMovimientosNegocio } from '../../api/negocios.js';
import { normalizarPagos, parseMonto } from '../../utils/conciliacion.js';
import { formatFechaUTC } from '../../utils/planDePagos.js';
import { resolverValorVenta } from './obtenerConciliacionCompleta.js';
import styles from './NegocioDetallePage.module.css';
import { ConciliacionHero, HitoCard } from './ConciliacionUI.jsx';
import concStyles from './Conciliacion.module.css';

function formatCOP(val) {
  if (val == null || Number.isNaN(val)) return null;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
}

async function cargarMovimientos(negocioId) {
  const movimientos = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await getMovimientosNegocio(negocioId, { page, limit: 200 });
    movimientos.push(...(res.data?.data || []));
    totalPages = res.data?.pagination?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return movimientos;
}

export function ConciliacionSinPlan({ negocio, motivo }) {
  const [movimientos, setMovimientos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    cargarMovimientos(negocio.id)
      .then((m) => { if (alive) setMovimientos(m); })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [negocio.id]);

  const datos = useMemo(() => {
    if (!movimientos) return null;
    const pagos = normalizarPagos(movimientos);
    const totalPagado = pagos.reduce((s, p) => s + p.valor, 0);
    const valorVenta = resolverValorVenta(negocio);
    const ciKey = Object.keys(negocio.datos || {}).find((k) => k.toLowerCase() === 'cuota inicial');
    const cuotaInicial = ciKey ? parseMonto(negocio.datos[ciKey]) : NaN;
    // normalizarPagos no devuelve el tipo: se toma del movimiento original, como en la tabla del historial.
    const tipoPorId = new Map(movimientos.map((m) => [m.id_movimiento, m.datos?.['Tipo Movimiento'] || m.datos?.Concepto || null]));
    let acumulado = 0;
    const filas = pagos.map((p) => { acumulado += p.valor; return { ...p, tipo: tipoPorId.get(p.id) ?? null, acumulado }; });
    return {
      filas,
      totalPagado,
      valorVenta: valorVenta != null && !Number.isNaN(valorVenta) ? valorVenta : null,
      cuotaInicial: Number.isNaN(cuotaInicial) ? null : cuotaInicial,
    };
  }, [movimientos, negocio]);

  if (error) return <p className={styles.error}>Error cargando la conciliación: {error}</p>;
  if (!datos) return <p className={styles.cargando}>Cargando conciliación…</p>;

  const { filas, totalPagado, valorVenta, cuotaInicial } = datos;
  const pendiente = valorVenta != null ? Math.max(0, valorVenta - totalPagado) : null;
  const saldoAFavor = valorVenta != null ? Math.max(0, totalPagado - valorVenta) : 0;
  const pagadoCuotaInicial = cuotaInicial != null ? Math.min(Math.max(0, totalPagado), cuotaInicial) : null;

  return (
    <div className={styles.seccionBody}>
      <p className={concStyles.aviso}>
        <Info size={15} aria-hidden="true" />
        <span>
          {motivo === 'sin-oportunidad'
            ? 'Este negocio no tiene una oportunidad de Zoho vinculada, así que no hay plan de pagos que conciliar.'
            : 'La oportunidad vinculada no tiene plan de pagos registrado, así que no hay cuotas que conciliar.'}
          {' '}Se muestra lo que trae la fiducia: valor de venta, cuota inicial y pagos.
        </span>
      </p>

      <ConciliacionHero
        etiquetaTotal="Valor de venta"
        total={valorVenta}
        infoTotal="Valor de venta que trae el Excel de la fiducia para el negocio (en Etapas 1 y 2, si está VENDIDO, el Valor factura)."
        pagado={totalPagado}
        saldoAFavor={saldoAFavor}
        pendiente={pendiente}
        datos={[{ etiqueta: 'Pagos registrados', valor: `${filas.length}`, sub: filas.length > 0 ? 'Con las reglas de la conciliación' : undefined }]}
      />

      {cuotaInicial != null && (
        <div className={concStyles.hitos}>
          <HitoCard
            titulo="Cuota inicial"
            subtitulo="Según la fiducia"
            valor={cuotaInicial}
            pagado={pagadoCuotaInicial ?? 0}
          />
          {valorVenta != null && valorVenta > cuotaInicial && (
            <HitoCard
              titulo="Saldo restante"
              subtitulo="Valor de venta menos cuota inicial"
              valor={valorVenta - cuotaInicial}
              pagado={Math.max(0, totalPagado - cuotaInicial)}
            />
          )}
        </div>
      )}

      {filas.length === 0 ? (
        <p className={styles.sinDatosPad}>Este negocio no tiene pagos registrados en la fiducia.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha de pago</th>
                <th>Movimiento</th>
                <th>Referencia del movimiento</th>
                <th className={styles.right}>Valor</th>
                <th className={styles.right}>Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p, i) => (
                <tr key={`${p.id ?? 'sin-id'}-${i}`}>
                  <td className={styles.nowrap}>{p.fecha ? formatFechaUTC(p.fecha) : <span className={styles.vacio}>Sin fecha</span>}</td>
                  <td>{p.tipo || <span className={styles.vacio}>—</span>}</td>
                  <td className={styles.nowrap}>{p.id ?? <span className={styles.vacio}>—</span>}</td>
                  <td className={`${styles.nowrap} ${styles.right} ${styles.tabular} ${p.valor < 0 ? styles.textoPeligro : ''}`}>
                    {p.valor < 0 ? '-' : ''}{formatCOP(Math.abs(p.valor))}
                  </td>
                  <td className={`${styles.nowrap} ${styles.right} ${styles.tabular}`}>{formatCOP(p.acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
