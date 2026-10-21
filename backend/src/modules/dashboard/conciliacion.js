// Puerto exacto (sin cambios de comportamiento) de
// zoho-payment-tracker/backend/src/baia-kristal/services/conciliacionService.js,
// que a su vez es puerto de frontend/src/utils/conciliacion.js +
// planDePagos.js. Motor de conciliación: plan de pagos (subforms de Zoho)
// vs. movimientos reales (Excel de fiducia) -- lógica financiera pura, sin
// dependencia de BD, así que se copia literal.

function detectarCuotaKey(rows) {
  if (!rows?.length) return null;
  return (
    Object.keys(rows[0] || {}).find((k) => rows.some((r) => String(r[k] || '').toLowerCase().includes('separaci'))) || null
  );
}

function fechaEstimadaCuota(fechaBase, cuotaVal) {
  if (!fechaBase) return null;
  const base = new Date(fechaBase);
  const val = String(cuotaVal || '').trim();
  if (val.toLowerCase().includes('separaci')) return base;
  const n = parseInt(val, 10);
  if (!isNaN(n) && n > 0) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d;
  }
  return null;
}

// Parsea un valor monetario a número. NaN para vacíos y fechas dd/mm/aaaa.
function parseMonto(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return NaN;
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

function construirPlan(rows, fechaBase, { esPlanNegociado = true } = {}) {
  if (!rows?.length) return [];
  const keys = [...new Set(rows.flatMap(Object.keys))].filter((k) => !SKIP_KEYS.includes(k));
  const cuotaKey = detectarCuotaKey(rows);
  const moneyKeys = keys.includes('Pago_Cliente')
    ? ['Pago_Cliente']
    : keys.filter((k) => k !== cuotaKey && rows.some((r) => { const n = parseMonto(r[k]); return !isNaN(n) && n >= 1000; }));
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

const TIPOS_EXCLUIDOS_SIEMPRE = ['GENERADO POR VENTA UNIDAD'];

function normalizarPagos(movimientos) {
  const pagos = (movimientos || [])
    .filter((m) => {
      const tipo = String(m.datos?.['Tipo Movimiento'] || '').trim().toUpperCase();
      return !TIPOS_EXCLUIDOS_SIEMPRE.includes(tipo);
    })
    .map((m) => ({
      id: m.idMovimiento ?? null,
      fecha: m.fechaContable ? new Date(m.fechaContable) : null,
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

  const TOLERANCIA_CANCELACION = 1;
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

// Una cuota con valor NEGATIVO (típico: el Saldo Contraentrega recalculado como Valor Venta - resto del plan cuando el resto
// del plan suma MÁS que el valor de venta) no es una deuda sino un SALDO A FAVOR: se suma al TOTAL PAGADO para que la cuota
// anterior (la que el cliente consignó completa) quede cubierta y no parezca que se debe algo. El total del plan no cambia.
function saldoAFavorDelPlan(cuotasPlan) {
  return cuotasPlan.reduce((s, c) => s + (c.valorPlan < 0 ? -c.valorPlan : 0), 0);
}

function conciliar(cuotasPlan, pagos) {
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
    return { ...c, cubierto, estado, atrasada, diasAtraso, fechaCubierta, pagosAplicados };
  });

  const totalPlan = cuotas.reduce((s, c) => s + c.valorPlan, 0);
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

// Acumulación por periodo (mes/día) de esperado/recaudado/por-recaudar --
// extraído de `dashboard.service.js` (2026-09-25) para que
// `olivResumen.service.js` (Oliv) pueda reusar EXACTAMENTE el mismo cálculo
// en vez de duplicarlo. Puro, sin BD, igual que el resto de este archivo.
function mesKey(fecha) {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

function diaKey(fecha) {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(fecha.getUTCDate()).padStart(2, '0')}`;
}

function periodoVacio() {
  return { esperado: 0, recaudado: 0, porRecaudar: 0 };
}

// `cuotasCuotaInicial` = todas las cuotas del plan menos la última;
// `ultimaCuota` = la última (Baía Kristal: "Saldo Contraentrega"; Oliv:
// "Saldo final" -- el campo se llama igual en las dos, cambia solo la
// etiqueta que muestra el plan de pagos real).
function acumularPorPeriodo({ cuotas, cuotasCuotaInicial, ultimaCuota, pagos, resumen, keyFn, porPeriodo, porPeriodoInicial, porPeriodoContraentrega }) {
  for (const c of cuotas) {
    if (!c.fechaEstimada) continue;
    const k = keyFn(c.fechaEstimada);
    if (!porPeriodo[k]) porPeriodo[k] = periodoVacio();
    porPeriodo[k].esperado += c.valorPlan;
    porPeriodo[k].porRecaudar += c.valorPlan - c.cubierto;
  }
  for (const p of pagos) {
    if (!p.fecha) continue;
    const k = keyFn(p.fecha);
    if (!porPeriodo[k]) porPeriodo[k] = periodoVacio();
    porPeriodo[k].recaudado += p.valor;
  }
  for (const c of cuotasCuotaInicial) {
    if (c.fechaEstimada) {
      const k = keyFn(c.fechaEstimada);
      if (!porPeriodoInicial[k]) porPeriodoInicial[k] = periodoVacio();
      porPeriodoInicial[k].esperado += c.valorPlan;
      porPeriodoInicial[k].porRecaudar += c.valorPlan - c.cubierto;
    }
    for (const p of c.pagosAplicados) {
      if (!p.fecha) continue;
      const k = keyFn(p.fecha);
      if (!porPeriodoInicial[k]) porPeriodoInicial[k] = periodoVacio();
      porPeriodoInicial[k].recaudado += p.destinado;
    }
  }
  if (ultimaCuota) {
    if (ultimaCuota.fechaEstimada) {
      const k = keyFn(ultimaCuota.fechaEstimada);
      if (!porPeriodoContraentrega[k]) porPeriodoContraentrega[k] = periodoVacio();
      porPeriodoContraentrega[k].esperado += ultimaCuota.valorPlan;
      porPeriodoContraentrega[k].porRecaudar += ultimaCuota.valorPlan - ultimaCuota.cubierto;
    }
    for (const p of ultimaCuota.pagosAplicados) {
      if (!p.fecha) continue;
      const k = keyFn(p.fecha);
      if (!porPeriodoContraentrega[k]) porPeriodoContraentrega[k] = periodoVacio();
      porPeriodoContraentrega[k].recaudado += p.destinado;
    }
  }
  if (resumen.saldoAFavor > 0) {
    let acumulado = 0;
    for (const p of pagos) {
      const antes = acumulado;
      acumulado += p.valor;
      const lo = Math.min(antes, acumulado);
      const hi = Math.max(antes, acumulado);
      if (hi > resumen.totalPlan) {
        const solape = hi - Math.max(lo, resumen.totalPlan);
        const destinado = p.valor >= 0 ? solape : -solape;
        if (destinado !== 0 && p.fecha) {
          const k = keyFn(p.fecha);
          if (!porPeriodoContraentrega[k]) porPeriodoContraentrega[k] = periodoVacio();
          porPeriodoContraentrega[k].recaudado += destinado;
        }
      }
    }
  }
}

module.exports = {
  detectarCuotaKey, fechaEstimadaCuota, parseMonto, construirPlan, normalizarPagos, conciliar, saldoAFavorDelPlan,
  mesKey, diaKey, periodoVacio, acumularPorPeriodo,
};
