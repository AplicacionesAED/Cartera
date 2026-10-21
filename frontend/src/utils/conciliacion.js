// Adaptado de zoho-payment-tracker/frontend/src/utils/conciliacion.js -- misma
// lógica de cascada acumulada (plan de Zoho vs. pagos reales), solo cambian
// los nombres de campo del movimiento leído: el legado (Prisma) exponía
// `idMovimiento`/`fechaContable` en camelCase; el modelo Sequelize de Cartera
// (NegocioMovimiento) expone sus atributos tal cual están declarados,
// `id_movimiento`/`fecha_contable` en snake_case (ver negocio.service.js:getMovimientos,
// que no transforma las filas). `datos` (JSONB con las mismas claves crudas
// del Excel, ej. "Valor", "Tipo Movimiento") no cambia.
import { detectarCuotaKey, fechaEstimadaCuota } from './planDePagos.js';

// Parsea un valor monetario a número. NaN para vacíos y fechas dd/mm/aaaa.
export function parseMonto(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return NaN; // es una fecha
  const plano = Number(s);
  if (!isNaN(plano)) return plano;
  // Formato colombiano ("$110.499.735,00"): "." separador de miles, ","
  // separador decimal.
  const negativo = s.includes('-');
  const soloNumeros = s.replace(/[^0-9.,]/g, '');
  const ultimaComa = soloNumeros.lastIndexOf(',');
  const resultado = ultimaComa !== -1
    ? parseFloat(`${soloNumeros.slice(0, ultimaComa).replace(/\./g, '')}.${soloNumeros.slice(ultimaComa + 1)}`)
    : parseFloat(soloNumeros.replace(/\./g, ''));
  return negativo ? -Math.abs(resultado) : resultado;
}

const SKIP_KEYS = ['id', 'Created_Time', 'Modified_Time', '$line_tax', '$permissions', 'Owner'];

function esSaldoContraentrega(etiqueta) {
  return String(etiqueta ?? '').toLowerCase().replace(/\s+/g, '').includes('saldocontraentrega');
}

// Construye las cuotas del plan desde las filas del subform.
export function construirPlan(rows, fechaBase, { esPlanNegociado = true } = {}) {
  if (!rows?.length) return [];
  const keys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP_KEYS.includes(k));
  const cuotaKey = detectarCuotaKey(rows);
  const moneyKeys = keys.includes('Pago_Cliente')
    ? ['Pago_Cliente']
    : keys.filter(
        (k) => k !== cuotaKey && rows.some((r) => { const n = parseMonto(r[k]); return !isNaN(n) && n >= 1000; })
      );
  const plan = [];
  let ultimaFechaReal = null;
  rows.forEach((row, i) => {
    if (cuotaKey && String(row[cuotaKey] ?? '').toLowerCase().includes('total')) return;
    let valorPlan = NaN;
    for (const k of moneyKeys) {
      const n = parseMonto(row[k]);
      if (!isNaN(n) && n !== 0) { valorPlan = n; break; }
    }
    const fechaPropia = cuotaKey ? fechaEstimadaCuota(fechaBase, row[cuotaKey]) : null;
    if (fechaPropia) ultimaFechaReal = fechaPropia;
    if (isNaN(valorPlan) || valorPlan <= 0) {
      if (!(cuotaKey && esSaldoContraentrega(row[cuotaKey]))) return;
      valorPlan = 0;
    }
    const etiqueta = cuotaKey ? String(row[cuotaKey] ?? `Fila ${i + 1}`) : `Fila ${i + 1}`;
    let fechaEstimada = fechaPropia;
    if (!fechaEstimada && esPlanNegociado && cuotaKey && esSaldoContraentrega(row[cuotaKey]) && ultimaFechaReal) {
      const d = new Date(ultimaFechaReal);
      d.setUTCMonth(d.getUTCMonth() + 1);
      fechaEstimada = d;
    }
    plan.push({ etiqueta, valorPlan, fechaEstimada });
  });

  return plan;
}

// "Generado por venta unidad" no es un pago -- es el asiento que registra el
// valor total de venta del inmueble.
const TIPOS_EXCLUIDOS_SIEMPRE = ['GENERADO POR VENTA UNIDAD'];

// Pagos reales: todo movimiento del negocio cuenta (cualquier Tipo
// Movimiento y cualquier Estado), salvo los excluidos arriba. Ordenados por
// fecha contable ascendente (sin fecha al final).
export function normalizarPagos(movimientos) {
  const pagos = (movimientos || [])
    .filter((m) => {
      const tipo = String(m.datos?.['Tipo Movimiento'] || '').trim().toUpperCase();
      return !TIPOS_EXCLUIDOS_SIEMPRE.includes(tipo);
    })
    .map((m) => ({
      id: m.id_movimiento ?? null,
      fecha: m.fecha_contable ? new Date(m.fecha_contable) : null,
      valor: parseMonto(m.datos?.Valor),
      tipo: String(m.datos?.['Tipo Movimiento'] || '').trim().toUpperCase(),
    }))
    .filter((p) => !isNaN(p.valor) && p.valor !== 0)
    .sort((a, b) => {
      if (!a.fecha && !b.fecha) return 0;
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return a.fecha - b.fecha;
    });

  // Un DESISTIMIENTOS cancela todo lo anterior (ver detalle en el legado).
  const TOLERANCIA_CANCELACION = 1; // pesos, margen de redondeo
  let acumulado = 0;
  let ultimoReinicioIdx = -1;
  pagos.forEach((p, i) => {
    acumulado += p.valor;
    if (p.tipo === 'DESISTIMIENTOS') {
      ultimoReinicioIdx = i;
    } else if (p.tipo === 'AJUSTE MANUAL + Y -' && Math.abs(acumulado) < TOLERANCIA_CANCELACION) {
      ultimoReinicioIdx = i;
    }
  });
  const vigentes = ultimoReinicioIdx >= 0 ? pagos.slice(ultimoReinicioIdx + 1) : pagos;

  return vigentes.map(({ tipo, ...resto }) => resto);
}

// Pagos cuyo propio tramo en el acumulado se cruza con [desde, hasta).
function pagosEnTramo(prefijos, desde, hasta) {
  let antes = 0;
  const resultado = [];
  for (const p of prefijos) {
    const lo = Math.min(antes, p.acumulado);
    const hi = Math.max(antes, p.acumulado);
    if (hi > desde && lo < hasta) {
      const solape = Math.min(hi, hasta) - Math.max(lo, desde);
      const destinado = p.valor >= 0 ? solape : -solape;
      resultado.push({ id: p.id, fecha: p.fecha, valor: p.valor, destinado });
    }
    antes = p.acumulado;
  }
  return resultado;
}

// Cascada acumulada. Una cuota no pagada cuya fecha estimada ya venció queda
// marcada "atrasada".
// Una cuota con valor NEGATIVO (típico: el Saldo Contraentrega recalculado como Valor Venta - resto del plan cuando el resto
// del plan suma MÁS que el valor de venta) no es una deuda sino un SALDO A FAVOR: se suma al TOTAL PAGADO para que la cuota
// anterior (la que el cliente consignó completa) quede cubierta y no parezca que se debe algo. El total del plan no cambia.
export function saldoAFavorDelPlan(cuotasPlan) {
  return cuotasPlan.reduce((s, c) => s + (c.valorPlan < 0 ? -c.valorPlan : 0), 0);
}

export function conciliar(cuotasPlan, pagos) {
  const saldoAFavorPlan = saldoAFavorDelPlan(cuotasPlan);
  const totalPagado = pagos.reduce((s, p) => s + p.valor, 0) + saldoAFavorPlan;
  let acumuladoPago = 0;
  const prefijos = pagos.map((p) => ({ id: p.id, fecha: p.fecha, valor: p.valor, acumulado: (acumuladoPago += p.valor) }));

  const hoy = new Date();
  let disponible = totalPagado;
  let requerido = 0;

  const cuotas = cuotasPlan.map((c) => {
    const requeridoAntes = requerido;
    const cubierto = Math.max(0, Math.min(c.valorPlan, disponible));
    disponible -= cubierto;
    requerido += c.valorPlan;
    const estado = c.valorPlan - cubierto < 1 ? 'pagada' : cubierto > 0 ? 'parcial' : 'pendiente';
    let fechaCubierta = null;
    if (estado === 'pagada') {
      const p = prefijos.find((x) => x.acumulado >= requerido) ?? (saldoAFavorPlan > 0 ? prefijos[prefijos.length - 1] : undefined);
      fechaCubierta = p ? p.fecha : null;
    }
    const atrasada = estado !== 'pagada' && c.fechaEstimada != null && c.fechaEstimada < hoy;
    const diasAtraso = atrasada ? Math.floor((hoy.getTime() - c.fechaEstimada.getTime()) / 86400000) : null;
    const pagosAplicados = pagosEnTramo(prefijos, requeridoAntes, requerido);
    // Una cuota negativa (saldo a favor) se MUESTRA en 0: el cliente no debe pagar nada más. El valor original se conserva para el total del plan.
    return { ...c, valorPlan: Math.max(0, c.valorPlan), valorPlanOriginal: c.valorPlan, cubierto, estado, atrasada, diasAtraso, fechaCubierta, pagosAplicados };
  });

  const totalPlan = cuotas.reduce((s, c) => s + c.valorPlanOriginal, 0);
  const enMora = cuotas.filter((c) => c.atrasada);
  const maxDiasAtraso = enMora.length > 0 ? Math.max(...enMora.map((c) => c.diasAtraso ?? 0)) : 0;
  const saldoContraentrega = cuotas.length > 0 ? cuotas[cuotas.length - 1] : null;
  const resumen = {
    totalPlan,
    totalPagado,
    porcentaje: totalPlan > 0 ? Math.round((totalPagado / totalPlan) * 100) : 0,
    cuotasPagadas: cuotas.filter((c) => c.estado === 'pagada').length,
    totalCuotas: cuotas.length,
    cuotasEnMora: enMora.length,
    montoEnMora: enMora.reduce((s, c) => s + (c.valorPlan - c.cubierto), 0),
    maxDiasAtraso,
    saldoAFavor: Math.max(0, totalPagado - totalPlan),
    saldoContraentrega,
  };
  return { cuotas, resumen };
}
