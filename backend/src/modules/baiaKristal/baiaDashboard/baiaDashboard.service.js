// Puerto de zoho-payment-tracker/backend/src/baia-kristal/services/dashboardRecaudoService.js.
// El servicio más grande e importante del proyecto legado: calcula, para
// TODO el inventario, el plan de pagos vs. lo recaudado (conciliación real
// por inmueble), y alimenta tres pantallas: Dashboard Plan vs. Recaudo,
// Cartera en Gestión, y Resumen Gerencial (Consolidado de Cartera por
// Etapa). Puerto fiel -- es lógica financiera con reglas de negocio
// confirmadas una por una en producción, no UI, así que no se simplifica.
const { QueryTypes, Op } = require('sequelize');
const sequelize = require('../../../config/db');
const { lista, filtrarCascadaEnMemoria } = require('../../../utils/filtros');
const { PRIORIDAD_ESTADO_SQL } = require('../baiaVinculo/baiaVinculoResolver');
const InventarioItem = require('../baiaInventario/baiaInventarioItem.model');
const Negocio = require('../baiaNegocio/baiaNegocio.model');
const NegocioComprador = require('../baiaNegocio/baiaNegocioComprador.model');
const NegocioMovimiento = require('../baiaNegocio/baiaNegocioMovimiento.model');
const Oportunidad = require('../baiaOportunidad/baiaOportunidad.model');
const ResumenCarteraMensual = require('./resumenCarteraMensual.model');
const { construirPlan, normalizarPagos, conciliar, parseMonto, mesKey, diaKey, periodoVacio, acumularPorPeriodo } = require('./conciliacion');
const { valoresProyectoTorre, compararEtapas, esFrenteSeleccionable, parseProyectoTorre, formatearProyectoTorre, parsePisoNumero, obtenerEtapaTorre, nomenclaturaCompleta, PROYECTO_TORRE_EXCLUIDOS } = require('../baiaInventario/baiaInventarioTorres.service');
const { obtenerFechasEntregaConfiguradas, CLAVE_TODAS } = require('../baiaConfiguracionFrente/baiaConfiguracionFrente.service');
const { elegirOportunidadVigente } = require('../../../config/estadosOportunidad');
const { estaExcluidoDelPortafolio, esNombreMarcadoInvalido } = require('../../../config/inventarioExcluido');
const { getCache, getEnConstruccion, setCache, setEnConstruccion, invalidarCacheDashboard } = require('./baiaDashboardCache');

// Etapas 1 y 2 (Kabo/Prive) ya están en entrega -- para un inmueble VENDIDO
// de esas etapas, el Valor Venta real deja de ser "Valor venta" (estimado de
// la negociación) y pasa a ser "Valor Factura" (con el que se facturó al
// entregar). Fuera de Etapa 1/2, o si no está VENDIDO, o si no trae "Valor
// Factura" todavía, se usa "Valor venta" como siempre.
const ETAPAS_EN_ENTREGA = new Set(['1', '2']);
function resolverValorVenta(negocio, etapa) {
  const datos = negocio?.datos || {};
  if (negocio?.estado === 'VENDIDO' && ETAPAS_EN_ENTREGA.has(etapa)) {
    const facturaKey = Object.keys(datos).find((k) => k.toLowerCase() === 'valor factura');
    const valorFactura = facturaKey ? parseMonto(datos[facturaKey]) : NaN;
    if (!isNaN(valorFactura)) return valorFactura;
  }
  const ventaKey = Object.keys(datos).find((k) => k.toLowerCase() === 'valor venta');
  return ventaKey ? parseMonto(datos[ventaKey]) : null;
}

// Resuelve, para un conjunto de InventarioItem, su Negocio y Oportunidad
// vinculados -- en bloque (pocas queries, no una por inmueble).
async function resolverNegociosYOportunidades(inmuebles) {
  const negocios = await Negocio.findAll({
    attributes: ['id', 'referencia', 'datos', 'estado', 'en_tramite', 'es_canje'],
    include: [{ model: NegocioComprador, as: 'compradores', attributes: ['nombre'], separate: true, limit: 1, order: [['orden', 'ASC']] }],
    order: [['id', 'ASC']],
    raw: false,
  });
  const negocioPorReferencia = new Map(negocios.map((n) => [n.referencia, n]));

  // El negocio de cada inmueble lo decide vinculoResolver.js (referencia + oportunidad + nomenclatura de la
  // fiducia) y queda guardado en vinculos_negocio_inmueble: todos los módulos leen la misma decisión. Si una
  // unidad tiene varios negocios, cuenta el vigente (VENDIDO > PROMETIDO/OPCIONADO > EN_RETIRO > CEDIDO > LIBRE).
  const vinculos = inmuebles.length
    ? await sequelize.query(
        `SELECT v.inventario_id, v.referencia FROM vinculos_negocio_inmueble v
         JOIN negocios n ON n.referencia = v.referencia
         WHERE v.inventario_id = ANY($1::int[]) ORDER BY ${PRIORIDAD_ESTADO_SQL}, n.id ASC`,
        { bind: [inmuebles.map((i) => i.id)], type: QueryTypes.SELECT }
      )
    : [];
  const negocioPorInmuebleId = new Map();
  for (const v of vinculos.reverse()) {
    const negocio = negocioPorReferencia.get(v.referencia);
    if (negocio) negocioPorInmuebleId.set(v.inventario_id, negocio); // el último en escribirse es el de mayor prioridad
  }

  const referenciasNegocio = [...new Set([...negocioPorInmuebleId.values()].map((n) => n.referencia).filter(Boolean))];
  const attrs = ['id', 'referencia_recaudo', 'stage', 'fecha_inicio_plan_pagos', 'forma_pago', 'propuesta_pago'];
  const oportunidadesExactas = referenciasNegocio.length
    ? await Oportunidad.findAll({ where: { referencia_recaudo: { [Op.in]: referenciasNegocio } }, attributes: attrs, order: [['id', 'ASC']], raw: true })
    : [];

  const candidatasPorReferencia = new Map();
  for (const o of oportunidadesExactas) {
    if (!candidatasPorReferencia.has(o.referencia_recaudo)) candidatasPorReferencia.set(o.referencia_recaudo, []);
    candidatasPorReferencia.get(o.referencia_recaudo).push({ ...o, stage: o.stage });
  }
  const oportunidadPorReferencia = new Map();
  for (const [referencia, candidatas] of candidatasPorReferencia) {
    oportunidadPorReferencia.set(referencia, elegirOportunidadVigente(candidatas));
  }

  const sinMatch = referenciasNegocio.filter((r) => !oportunidadPorReferencia.has(r) && r.length >= 6);
  for (const referencia of sinMatch) {
    const candidatas = await Oportunidad.findAll({ where: { referencia_recaudo: { [Op.iLike]: `%${referencia}%` } }, attributes: attrs, raw: true });
    const elegida = elegirOportunidadVigente(candidatas);
    if (elegida) oportunidadPorReferencia.set(referencia, elegida);
  }

  return { negocioPorInmuebleId, oportunidadPorReferencia };
}

async function construirFilasCompletas() {
  const valores = await valoresProyectoTorre();
  const fechasEntregaConfiguradas = await obtenerFechasEntregaConfiguradas();

  const inmueblesSinFiltrar = await sequelize.query(
    `SELECT id, datos, proyecto, torre, piso, nombre, referencia_recaudo, estado FROM inventario_items
     ORDER BY datos->>'Proyecto_Torre' ASC NULLS LAST, datos->>'Product_Name' ASC NULLS LAST`,
    { type: QueryTypes.SELECT }
  );
  const inmuebles = inmueblesSinFiltrar.filter(
    (inv) => !estaExcluidoDelPortafolio(inv.datos?.Proyecto_Torre) && !esNombreMarcadoInvalido(inv.datos?.Product_Name)
  );

  const { negocioPorInmuebleId, oportunidadPorReferencia } = await resolverNegociosYOportunidades(inmuebles);

  const negocioIds = [...new Set([...negocioPorInmuebleId.values()].map((n) => n.id))];
  const movimientos = negocioIds.length ? await NegocioMovimiento.findAll({ where: { negocio_id: { [Op.in]: negocioIds } }, raw: true }) : [];
  const movimientosPorNegocioId = new Map();
  for (const m of movimientos) {
    if (!movimientosPorNegocioId.has(m.negocio_id)) movimientosPorNegocioId.set(m.negocio_id, []);
    movimientosPorNegocioId.get(m.negocio_id).push({ idMovimiento: m.id_movimiento, fechaContable: m.fecha_contable, datos: m.datos });
  }

  const filas = inmuebles.map((inv) => {
    const info = parseProyectoTorre(inv.datos?.Proyecto_Torre);
    const etapa = info ? obtenerEtapaTorre(inv.datos.Proyecto_Torre) : null;
    const negocio = negocioPorInmuebleId.get(inv.id) ?? null;
    const oportunidad = negocio ? oportunidadPorReferencia.get(negocio.referencia) ?? null : null;

    const porMes = {};
    const porMesInicial = {};
    const porMesContraentrega = {};
    const porDia = {};
    const porDiaInicial = {};
    const porDiaContraentrega = {};
    let valorInmueble = null;
    let valorCuotaInicial = null;
    let abonadoCuotaInicial = null;
    let fechaSaldoContraentrega = null;
    let valorSaldoContraentrega = null;
    let totalAbonado = null;
    let recaudoFiducia = null;
    let cuotasEnMora = 0;
    let montoEnMora = 0;
    let maxDiasAtraso = 0;
    let cuotasEnMoraInicial = 0;
    let montoEnMoraInicial = 0;
    let maxDiasAtrasoInicial = 0;
    let esperadoAFechaInicial = null;
    let esperadoAFecha = null;
    let saldoContraentregaVencido = false;
    let pendienteSaldoContraentrega = null;
    let diasAtrasoSaldoContraentrega = null;

    const pisoNumero = parsePisoNumero(inv.piso);
    const fechaConfigurada = info
      ? (pisoNumero && fechasEntregaConfiguradas.get(`${info.proyecto}||${info.torre}||${pisoNumero}`)) ??
        fechasEntregaConfiguradas.get(`${info.proyecto}||${info.torre}||${CLAVE_TODAS}`) ??
        fechasEntregaConfiguradas.get(`${info.proyecto}||${CLAVE_TODAS}||${CLAVE_TODAS}`) ??
        null
      : null;

    if (oportunidad) {
      const esPlanNegociado = !!oportunidad.propuesta_pago?.length;
      const planRows = esPlanNegociado ? oportunidad.propuesta_pago : oportunidad.forma_pago || [];
      const cuotasPlan = construirPlan(planRows, oportunidad.fecha_inicio_plan_pagos, { esPlanNegociado });

      const valorVenta = resolverValorVenta(negocio, etapa);
      if (valorVenta != null && !isNaN(valorVenta) && cuotasPlan.length >= 2) {
        const sumaResto = cuotasPlan.slice(0, -1).reduce((s, c) => s + c.valorPlan, 0);
        cuotasPlan[cuotasPlan.length - 1].valorPlan = valorVenta - sumaResto;
      }

      if (cuotasPlan.length > 0 && fechaConfigurada) {
        cuotasPlan[cuotasPlan.length - 1].fechaEstimada = fechaConfigurada;
      }

      const pagos = normalizarPagos(movimientosPorNegocioId.get(negocio.id) || []);
      const { cuotas, resumen } = conciliar(cuotasPlan, pagos);
      valorInmueble = cuotas.length > 0 ? resumen.totalPlan : null;
      fechaSaldoContraentrega = resumen.saldoContraentrega?.fechaEstimada ?? null;
      valorSaldoContraentrega = resumen.saldoContraentrega?.valorPlan ?? null;
      const cuotasCuotaInicial = cuotas.slice(0, -1);
      valorCuotaInicial = cuotasCuotaInicial.length > 0 ? cuotasCuotaInicial.reduce((s, c) => s + c.valorPlan, 0) : null;
      abonadoCuotaInicial = cuotasCuotaInicial.length > 0 ? cuotasCuotaInicial.reduce((s, c) => s + c.cubierto, 0) : null;

      const cuotaInicialFiduciaKey = Object.keys(negocio.datos || {}).find((k) => k.toLowerCase() === 'cuota inicial');
      const cuotaInicialFiducia = cuotaInicialFiduciaKey ? parseMonto(negocio.datos[cuotaInicialFiduciaKey]) : NaN;
      if (!isNaN(cuotaInicialFiducia)) {
        valorCuotaInicial = cuotaInicialFiducia;
        if (valorVenta != null && !isNaN(valorVenta)) valorSaldoContraentrega = Math.max(0, valorVenta - cuotaInicialFiducia); // nunca negativo: si ya pagó de más, no debe nada
      }

      totalAbonado = resumen.totalPagado;
      recaudoFiducia = resumen.totalPagado;
      cuotasEnMora = resumen.cuotasEnMora;
      montoEnMora = resumen.montoEnMora;
      maxDiasAtraso = resumen.maxDiasAtraso;
      const hoy = new Date();
      esperadoAFecha = cuotas.filter((c) => c.fechaEstimada && c.fechaEstimada <= hoy).reduce((s, c) => s + c.valorPlan, 0);

      const enMoraInicial = cuotasCuotaInicial.filter((c) => c.atrasada);
      cuotasEnMoraInicial = enMoraInicial.length;
      montoEnMoraInicial = enMoraInicial.reduce((s, c) => s + (c.valorPlan - c.cubierto), 0);
      maxDiasAtrasoInicial = enMoraInicial.length > 0 ? Math.max(...enMoraInicial.map((c) => c.diasAtraso ?? 0)) : 0;
      esperadoAFechaInicial = cuotasCuotaInicial.filter((c) => c.fechaEstimada && c.fechaEstimada <= hoy).reduce((s, c) => s + c.valorPlan, 0);

      const sce = resumen.saldoContraentrega;
      if (sce?.atrasada) {
        const pendiente = Math.max(0, sce.valorPlan - sce.cubierto);
        if (pendiente > 1000) {
          saldoContraentregaVencido = true;
          pendienteSaldoContraentrega = pendiente;
          diasAtrasoSaldoContraentrega = sce.diasAtraso;
        }
      }

      const ultimaCuota = cuotas[cuotas.length - 1];
      const paramsAcumular = { cuotas, cuotasCuotaInicial, ultimaCuota, pagos, resumen };
      acumularPorPeriodo({ ...paramsAcumular, keyFn: mesKey, porPeriodo: porMes, porPeriodoInicial: porMesInicial, porPeriodoContraentrega: porMesContraentrega });
      acumularPorPeriodo({ ...paramsAcumular, keyFn: diaKey, porPeriodo: porDia, porPeriodoInicial: porDiaInicial, porPeriodoContraentrega: porDiaContraentrega });
    }

    // Precio unitario del inmueble (Unit_Price): con él se suma el valor de las unidades disponibles (estado fiducia LIBRE).
    const precioUnitarioNum = Number(inv.datos?.Unit_Price);
    const precioUnitario = !isNaN(precioUnitarioNum) && precioUnitarioNum > 0 ? precioUnitarioNum : null;
    if (valorInmueble == null && precioUnitario != null) valorInmueble = precioUnitario;
    // Recaudado del Resumen: el Total pagado de la conciliación. Si el negocio no tiene oportunidad (no hay plan que
    // conciliar), se suman sus movimientos con la misma normalización de la conciliación (sin el asiento de venta y desde
    // el último desistimiento), para que sus pagos también cuenten.
    if (recaudoFiducia == null && negocio) {
      recaudoFiducia = normalizarPagos(movimientosPorNegocioId.get(negocio.id) || []).reduce((suma, p) => suma + p.valor, 0);
    }
    // Valor de venta y cuota inicial tal como los trae el Excel de la fiducia (no el plan de pagos de Zoho): con ellos
    // se suman el valor ventas fiduciaria y el valor cuotas iniciales del Resumen, tenga o no el negocio oportunidad.
    let valorVentaFiducia = null;
    let cuotaInicialFiduciaResumen = null;
    if (negocio) {
      const vv = resolverValorVenta(negocio, etapa);
      if (vv != null && !isNaN(vv)) valorVentaFiducia = vv;
      const ciKey = Object.keys(negocio.datos || {}).find((k) => k.toLowerCase() === 'cuota inicial');
      const ci = ciKey ? parseMonto(negocio.datos[ciKey]) : NaN;
      if (!isNaN(ci)) cuotaInicialFiduciaResumen = ci;
    }
    if (fechaSaldoContraentrega == null && fechaConfigurada) fechaSaldoContraentrega = fechaConfigurada;

    return {
      id: inv.id,
      etapa,
      frente: info ? info.proyecto : null,
      torre: info ? info.torre : null,
      nomenclatura: nomenclaturaCompleta({ proyecto: inv.proyecto, torre: inv.torre, piso: inv.piso, nombre: inv.nombre, datos: inv.datos }),
      unidad: inv.datos?.Product_Name ?? null,
      valorInmueble,
      valorVentaFiducia,
      precioUnitario,
      valorCuotaInicial,
      cuotaInicialFiducia: cuotaInicialFiduciaResumen,
      abonadoCuotaInicial,
      fechaSaldoContraentrega,
      valorSaldoContraentrega,
      totalAbonado,
      recaudoFiducia,
      opportunityId: oportunidad?.id ?? null,
      cuotasEnMora,
      montoEnMora,
      maxDiasAtraso,
      esperadoAFecha,
      cuotasEnMoraInicial,
      montoEnMoraInicial,
      maxDiasAtrasoInicial,
      esperadoAFechaInicial,
      saldoContraentregaVencido,
      pendienteSaldoContraentrega,
      diasAtrasoSaldoContraentrega,
      negocioId: negocio?.id ?? null,
      referencia: negocio?.referencia ?? null,
      comprador: negocio?.compradores?.[0]?.nombre ?? null,
      estado: negocio?.estado ?? null,
      // Mismo estado fiducia que muestra Inmuebles: VIP del CRM, si no el del negocio vinculado, si no LIBRE.
      estadoFiducia: inv.estado === 'VIP' ? 'VIP' : (negocio?.estado ?? 'LIBRE'),
      enTramite: negocio?.en_tramite ?? false,
      esCanje: negocio?.es_canje ?? false,
      estadoInventario: inv.estado ?? null,
      _tieneMovimientos: !!negocio && (movimientosPorNegocioId.get(negocio.id)?.length ?? 0) > 0,
      porMes,
      porMesInicial,
      porMesContraentrega,
      porDia,
      porDiaInicial,
      porDiaContraentrega,
    };
  });

  return { filas, valores };
}

// Un inmueble está "disponible" solo si su ESTADO FIDUCIA en el módulo Inmuebles es LIBRE (ver ESTADO_FIDUCIA_SQL en
// baiaInventario.service.js); cualquier otro estado cuenta como "vendido". Misma regla para los KPIs de Inmuebles
// disponibles/vendidos del Resumen y para "Uni. disponible" del Consolidado.
const esVendido = (f) => f.estadoFiducia !== 'LIBRE';

async function obtenerCache() {
  const cached = getCache();
  if (cached) return cached;
  const enConstruccion = getEnConstruccion();
  if (enConstruccion) return enConstruccion;

  const promesa = construirFilasCompletas()
    .then((resultado) => {
      const nuevoCache = { ...resultado, builtAt: Date.now() };
      setCache(nuevoCache);
      setEnConstruccion(null);
      return nuevoCache;
    })
    .catch((err) => {
      setEnConstruccion(null);
      throw err;
    });
  setEnConstruccion(promesa);
  return promesa;
}

const CAMPOS_ORDENABLES_DASHBOARD = new Set([
  'etapa', 'frente', 'torre', 'unidad', 'valorInmueble', 'valorCuotaInicial', 'abonadoCuotaInicial',
  'totalAbonado', 'pendienteRecaudar', 'cuotasEnMora', 'montoEnMora',
  'fechaSaldoContraentrega', 'valorSaldoContraentrega',
]);
const CAMPOS_NUMERICOS_DASHBOARD = new Set([
  'valorInmueble', 'valorCuotaInicial', 'abonadoCuotaInicial', 'totalAbonado', 'pendienteRecaudar',
  'cuotasEnMora', 'montoEnMora', 'valorSaldoContraentrega',
]);

function ordenarDashboard(filas, sortBy, sortDir) {
  if (!CAMPOS_ORDENABLES_DASHBOARD.has(sortBy) || (sortDir !== 'asc' && sortDir !== 'desc')) return filas;
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    let va = a[sortBy];
    let vb = b[sortBy];
    if (sortBy === 'pendienteRecaudar') {
      va = a.valorInmueble != null && a.totalAbonado != null ? Math.max(0, a.valorInmueble - a.totalAbonado) : null;
      vb = b.valorInmueble != null && b.totalAbonado != null ? Math.max(0, b.valorInmueble - b.totalAbonado) : null;
    }
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (sortBy === 'etapa') return dir * compararEtapas(va, vb);
    if (sortBy === 'fechaSaldoContraentrega') return dir * (new Date(va) - new Date(vb));
    if (CAMPOS_NUMERICOS_DASHBOARD.has(sortBy)) return dir * (va - vb);
    return dir * String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
  });
}

async function obtenerDashboardRecaudo({ search, etapa, frente, torre, conMovimientos, sortBy, sortDir, page, limit }) {
  const { filas: todasLasFilas, valores } = await obtenerCache();

  let filas = todasLasFilas;
  if (search) {
    const s = search.toLowerCase();
    filas = filas.filter((f) => f.nomenclatura?.toLowerCase().includes(s) || `${f.frente ?? ''} ${f.torre ?? ''}`.toLowerCase().includes(s));
  }
  filas = filtrarCascadaEnMemoria(filas, { etapa, frente, torre });
  if (conMovimientos === 'true') filas = filas.filter((f) => f._tieneMovimientos);
  filas = ordenarDashboard(filas, sortBy, sortDir);

  const mesesSet = new Set();
  const totalesPorMes = new Map();
  const totalesPorMesInicial = new Map();
  const totalesPorMesContraentrega = new Map();
  const totalesPorEtapa = new Map();
  const diasSet = new Set();
  const totalesPorDia = new Map();
  const totalesPorDiaInicial = new Map();
  const totalesPorDiaContraentrega = new Map();
  const totalesColumnasFijas = {
    valorInmueble: 0, valorCuotaInicial: 0, abonadoCuotaInicial: 0,
    valorSaldoContraentrega: 0, totalAbonado: 0, pendienteRecaudar: 0,
    cuotasEnMora: 0, montoEnMora: 0,
    pendienteContraentrega: 0, recaudadoContraentrega: 0,
    cuotasEnMoraInicial: 0, montoEnMoraInicial: 0,
    valorDisponible: 0, cantidadDisponible: 0,
    valorVendidos: 0, cantidadVendidos: 0,
  };
  for (const f of filas) {
    if (f.valorInmueble != null) totalesColumnasFijas.valorInmueble += f.valorInmueble;
    if (f.valorCuotaInicial != null) totalesColumnasFijas.valorCuotaInicial += f.valorCuotaInicial;
    if (f.abonadoCuotaInicial != null) totalesColumnasFijas.abonadoCuotaInicial += f.abonadoCuotaInicial;
    if (f.valorSaldoContraentrega != null) totalesColumnasFijas.valorSaldoContraentrega += f.valorSaldoContraentrega;
    if (f.totalAbonado != null) totalesColumnasFijas.totalAbonado += f.totalAbonado;
    totalesColumnasFijas.cuotasEnMora += f.cuotasEnMora ?? 0;
    totalesColumnasFijas.montoEnMora += f.montoEnMora ?? 0;
    totalesColumnasFijas.cuotasEnMoraInicial += f.cuotasEnMoraInicial ?? 0;
    totalesColumnasFijas.montoEnMoraInicial += f.montoEnMoraInicial ?? 0;

    if (esVendido(f)) {
      if (f.valorVentaFiducia != null) totalesColumnasFijas.valorVendidos += f.valorVentaFiducia;
      totalesColumnasFijas.cantidadVendidos += 1;
    } else {
      if (f.precioUnitario != null) totalesColumnasFijas.valorDisponible += f.precioUnitario;
      totalesColumnasFijas.cantidadDisponible += 1;
    }

    for (const [mes, v] of Object.entries(f.porMes)) {
      mesesSet.add(mes);
      if (!totalesPorMes.has(mes)) totalesPorMes.set(mes, periodoVacio());
      const t = totalesPorMes.get(mes);
      t.esperado += v.esperado;
      t.recaudado += v.recaudado;
      t.porRecaudar += v.porRecaudar ?? 0;
      if (f.etapa != null) {
        if (!totalesPorEtapa.has(f.etapa)) totalesPorEtapa.set(f.etapa, { esperado: 0, recaudado: 0 });
        const te = totalesPorEtapa.get(f.etapa);
        te.esperado += v.esperado;
        te.recaudado += v.recaudado;
      }
    }
    for (const [mes, v] of Object.entries(f.porMesInicial)) {
      mesesSet.add(mes);
      if (!totalesPorMesInicial.has(mes)) totalesPorMesInicial.set(mes, periodoVacio());
      const t = totalesPorMesInicial.get(mes);
      t.esperado += v.esperado; t.recaudado += v.recaudado; t.porRecaudar += v.porRecaudar ?? 0;
    }
    for (const [mes, v] of Object.entries(f.porMesContraentrega)) {
      mesesSet.add(mes);
      if (!totalesPorMesContraentrega.has(mes)) totalesPorMesContraentrega.set(mes, periodoVacio());
      const t = totalesPorMesContraentrega.get(mes);
      t.esperado += v.esperado; t.recaudado += v.recaudado; t.porRecaudar += v.porRecaudar ?? 0;
    }
    for (const [dia, v] of Object.entries(f.porDia)) {
      diasSet.add(dia);
      if (!totalesPorDia.has(dia)) totalesPorDia.set(dia, periodoVacio());
      const t = totalesPorDia.get(dia);
      t.esperado += v.esperado; t.recaudado += v.recaudado; t.porRecaudar += v.porRecaudar ?? 0;
    }
    for (const [dia, v] of Object.entries(f.porDiaInicial)) {
      diasSet.add(dia);
      if (!totalesPorDiaInicial.has(dia)) totalesPorDiaInicial.set(dia, periodoVacio());
      const t = totalesPorDiaInicial.get(dia);
      t.esperado += v.esperado; t.recaudado += v.recaudado; t.porRecaudar += v.porRecaudar ?? 0;
    }
    for (const [dia, v] of Object.entries(f.porDiaContraentrega)) {
      diasSet.add(dia);
      if (!totalesPorDiaContraentrega.has(dia)) totalesPorDiaContraentrega.set(dia, periodoVacio());
      const t = totalesPorDiaContraentrega.get(dia);
      t.esperado += v.esperado; t.recaudado += v.recaudado; t.porRecaudar += v.porRecaudar ?? 0;
    }
  }

  const abonadoHaciaCuotaInicial = Math.min(totalesColumnasFijas.valorCuotaInicial, totalesColumnasFijas.totalAbonado);
  const abonadoHaciaContraentrega = Math.max(0, totalesColumnasFijas.totalAbonado - totalesColumnasFijas.valorCuotaInicial);
  totalesColumnasFijas.pendienteRecaudar = Math.max(0, totalesColumnasFijas.valorInmueble - totalesColumnasFijas.totalAbonado);
  totalesColumnasFijas.pendienteContraentrega = Math.max(0, totalesColumnasFijas.valorSaldoContraentrega - abonadoHaciaContraentrega);
  totalesColumnasFijas.recaudadoContraentrega = Math.min(abonadoHaciaContraentrega, totalesColumnasFijas.valorSaldoContraentrega);

  const meses = [...mesesSet].sort();
  const totales = Object.fromEntries(meses.map((m) => [m, totalesPorMes.get(m)]));
  const totalesInicial = Object.fromEntries(meses.map((m) => [m, totalesPorMesInicial.get(m) ?? periodoVacio()]));
  const totalesContraentrega = Object.fromEntries(meses.map((m) => [m, totalesPorMesContraentrega.get(m) ?? periodoVacio()]));
  const etapasOrdenadas = [...totalesPorEtapa.keys()].sort(compararEtapas);
  const totalesEtapa = Object.fromEntries(etapasOrdenadas.map((e) => [e, totalesPorEtapa.get(e)]));

  const dias = [...diasSet].sort();
  const totalesDia = Object.fromEntries(dias.map((d) => [d, totalesPorDia.get(d)]));
  const totalesDiaInicial = Object.fromEntries(dias.map((d) => [d, totalesPorDiaInicial.get(d) ?? periodoVacio()]));
  const totalesDiaContraentrega = Object.fromEntries(dias.map((d) => [d, totalesPorDiaContraentrega.get(d) ?? periodoVacio()]));

  const total = filas.length;
  const pageNum = Math.max(1, page);
  const limitNum = Math.max(1, limit);
  const data = filas.slice((pageNum - 1) * limitNum, pageNum * limitNum).map(({ _tieneMovimientos, porDia, porDiaInicial, porDiaContraentrega, ...fila }) => fila);

  return {
    data,
    meses, totales, totalesInicial, totalesContraentrega,
    dias, totalesDia, totalesDiaInicial, totalesDiaContraentrega,
    totalesColumnasFijas,
    totalesPorEtapa: totalesEtapa,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    etapasDisponibles: [...valores.porEtapa.keys()].sort(compararEtapas),
    frentesDisponibles: [...valores.porFrente.keys()].filter(esFrenteSeleccionable).sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

const RANGOS_MORA = [
  { key: '1-5', label: '1 a 5 días', min: 1, max: 5 },
  { key: '6-30', label: '6 a 30 días', min: 6, max: 30 },
  { key: '31-60', label: '31 a 60 días', min: 31, max: 60 },
  { key: '61-90', label: '61 a 90 días', min: 61, max: 90 },
  { key: '90+', label: 'Más de 90 días', min: 91, max: Infinity },
];

function claveRangoMora(dias) {
  return (RANGOS_MORA.find((r) => dias >= r.min && dias <= r.max) ?? RANGOS_MORA[RANGOS_MORA.length - 1]).key;
}

const CAMPOS_ORDENABLES_MORA = new Set([
  'etapa', 'frente', 'torre', 'unidad', 'referencia', 'comprador', 'estado',
  'valorInmueble', 'totalAbonado', 'cuotasEnMora', 'maxDiasAtraso', 'montoEnMora', 'pctEnMora',
  'fechaSaldoContraentrega',
]);
const CAMPOS_NUMERICOS_MORA = new Set(['valorInmueble', 'totalAbonado', 'cuotasEnMora', 'maxDiasAtraso', 'montoEnMora', 'pctEnMora']);

function ordenarCarteraMora(filas, sortBy, sortDir) {
  if (!CAMPOS_ORDENABLES_MORA.has(sortBy) || (sortDir !== 'asc' && sortDir !== 'desc')) {
    return [...filas].sort((a, b) => b.maxDiasAtraso - a.maxDiasAtraso);
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const va = a[sortBy];
    const vb = b[sortBy];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (sortBy === 'etapa') return dir * compararEtapas(va, vb);
    if (sortBy === 'fechaSaldoContraentrega') return dir * (new Date(va) - new Date(vb));
    if (CAMPOS_NUMERICOS_MORA.has(sortBy)) return dir * (va - vb);
    return dir * String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
  });
}

async function obtenerCarteraMora({ search, etapa, frente, torre, rango, vista, tramite, sortBy, sortDir, page, limit }) {
  const { filas: filasCache, valores } = await obtenerCache();

  const todasLasFilas = tramite === 'canje' ? filasCache.filter((f) => f.esCanje) : filasCache.filter((f) => !f.esCanje);

  const conteos = {
    inicial: todasLasFilas.filter((f) => f.cuotasEnMoraInicial > 0).length,
    contraentrega: todasLasFilas.filter((f) => f.saldoContraentregaVencido).length,
  };

  let filas = vista === 'contraentrega'
    ? todasLasFilas.filter((f) => f.saldoContraentregaVencido).map((f) => ({
        ...f,
        cuotasEnMora: 1,
        montoEnMora: f.pendienteSaldoContraentrega,
        maxDiasAtraso: f.diasAtrasoSaldoContraentrega ?? 0,
        esperadoAFecha: f.valorSaldoContraentrega ?? 0,
      }))
    : todasLasFilas.filter((f) => f.cuotasEnMoraInicial > 0).map((f) => ({
        ...f,
        cuotasEnMora: f.cuotasEnMoraInicial,
        montoEnMora: f.montoEnMoraInicial,
        maxDiasAtraso: f.maxDiasAtrasoInicial,
        esperadoAFecha: f.esperadoAFechaInicial,
      }));

  if (search) {
    const s = search.toLowerCase();
    filas = filas.filter((f) => f.nomenclatura?.toLowerCase().includes(s) || f.comprador?.toLowerCase().includes(s) || f.referencia?.toLowerCase().includes(s) || `${f.frente ?? ''} ${f.torre ?? ''}`.toLowerCase().includes(s));
  }
  if (tramite === 'en_tramite') filas = filas.filter((f) => f.enTramite);
  else if (tramite === 'no_en_tramite') filas = filas.filter((f) => !f.enTramite);
  filas = filtrarCascadaEnMemoria(filas, { etapa, frente, torre });

  const porRangoMoraMap = new Map(RANGOS_MORA.map((r) => [r.key, { count: 0, monto: 0 }]));
  for (const f of filas) {
    const b = porRangoMoraMap.get(claveRangoMora(f.maxDiasAtraso));
    b.count += 1;
    b.monto += f.montoEnMora;
  }
  const porRangoMora = RANGOS_MORA.map((r) => ({ rango: r.key, label: r.label, ...porRangoMoraMap.get(r.key) }));

  const rangos = lista(rango);
  if (rangos.length) filas = filas.filter((f) => rangos.includes(claveRangoMora(f.maxDiasAtraso)));

  const totalCuotasEnMora = filas.reduce((s, f) => s + f.cuotasEnMora, 0);
  const totalMontoEnMora = filas.reduce((s, f) => s + f.montoEnMora, 0);
  const totalEsperadoAFecha = filas.reduce((s, f) => s + (f.esperadoAFecha ?? 0), 0);
  const pctMoraPortafolio = totalEsperadoAFecha > 0 ? (totalMontoEnMora / totalEsperadoAFecha) * 100 : null;

  filas = filas.map((f) => ({ ...f, pctEnMora: f.esperadoAFecha > 0 ? (f.montoEnMora / f.esperadoAFecha) * 100 : null }));
  filas = ordenarCarteraMora(filas, sortBy, sortDir);

  const total = filas.length;
  const pageNum = Math.max(1, page);
  const limitNum = Math.max(1, limit);
  const data = filas.slice((pageNum - 1) * limitNum, pageNum * limitNum).map(({
    _tieneMovimientos, porMes, porMesInicial, porMesContraentrega,
    porDia, porDiaInicial, porDiaContraentrega, esperadoAFecha,
    cuotasEnMoraInicial, montoEnMoraInicial, maxDiasAtrasoInicial, esperadoAFechaInicial,
    saldoContraentregaVencido, pendienteSaldoContraentrega, diasAtrasoSaldoContraentrega,
    ...fila
  }) => fila);

  return {
    data,
    resumen: { negociosEnMora: total, totalCuotasEnMora, totalMontoEnMora, totalEsperadoAFecha, pctMoraPortafolio },
    conteos,
    porRangoMora,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    etapasDisponibles: [...valores.porEtapa.keys()].sort(compararEtapas),
    frentesDisponibles: [...valores.porFrente.keys()].filter(esFrenteSeleccionable).sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

const ESTADOS_INV_VENDIDA_CRM = new Set(['Vendido', 'Reservado', 'Separado']);
const UMBRAL_CARTERA_DIAS = 5;

function acumuladoEtapaVacio() {
  return {
    uniTotales: 0, uniVendidasFidu: 0, uniVendidasCRM: 0,
    valorTotalVentasFiduciaria: 0, valorCuotasIniciales: 0, valorTotalUnidadesDisponibles: 0,
    recaudoReal: 0, recaudoCuotaInicial: 0, carteraMas5Dias: 0, esperadoAFechaInicial: 0,
  };
}

const CAMPOS_SUMABLES_TOTAL = [
  'uniTotales', 'uniVendidasFidu', 'uniVendidasCRM',
  'valorTotalVenta', 'valorTotalVentasFiduciaria', 'valorCuotasIniciales', 'valorTotalUnidadesDisponibles',
  'recaudoReal', 'recaudoCuotaInicial', 'carteraMas5Dias', 'esperadoAFechaInicial',
  'recaudoCredito', 'pendienteTotalFiduciaria', 'pendienteCuotaInicial', 'pendienteCredito',
];

async function obtenerResumenPorEtapa() {
  const { filas } = await obtenerCache();
  const porEtapa = new Map();

  for (const f of filas) {
    if (f.etapa == null) continue;
    if (!porEtapa.has(f.etapa)) porEtapa.set(f.etapa, acumuladoEtapaVacio());
    const e = porEtapa.get(f.etapa);
    e.uniTotales += 1;
    if (esVendido(f)) e.uniVendidasFidu += 1;
    if (ESTADOS_INV_VENDIDA_CRM.has(f.estadoInventario)) e.uniVendidasCRM += 1;

    if (esVendido(f)) {
      if (f.valorVentaFiducia != null) e.valorTotalVentasFiduciaria += f.valorVentaFiducia;
      if (f.cuotaInicialFiducia != null) e.valorCuotasIniciales += f.cuotaInicialFiducia;
      // Recaudado y pendiente por negocio, sobre los valores de la fiducia: lo pagado cubre primero la cuota inicial y lo
      // que sobra va al crédito (saldo). Así cada negocio queda entre 0 y su valor, sin que un sobrepago de uno tape lo
      // que debe otro.
      const venta = f.valorVentaFiducia;
      const cuotaInicial = f.cuotaInicialFiducia;
      const pagado = f.recaudoFiducia ?? 0;
      e.recaudoReal += pagado;
      if (cuotaInicial != null) {
        e.recaudoCuotaInicial += Math.min(pagado, cuotaInicial);
      }
      if (f.esperadoAFechaInicial != null) e.esperadoAFechaInicial += f.esperadoAFechaInicial;
      if ((f.maxDiasAtrasoInicial ?? 0) > UMBRAL_CARTERA_DIAS) e.carteraMas5Dias += f.montoEnMoraInicial ?? 0;
    } else if (f.precioUnitario != null) {
      e.valorTotalUnidadesDisponibles += f.precioUnitario;
    }
  }

  const fechaCorte = new Date().toISOString();
  const etapas = [...porEtapa.keys()].sort(compararEtapas).map((etapa) => {
    const e = porEtapa.get(etapa);
    const valorTotalVenta = e.valorTotalVentasFiduciaria + e.valorTotalUnidadesDisponibles;
    const pendienteTotal = Math.max(0, e.valorTotalVentasFiduciaria - e.recaudoReal);
    const pendienteCuotaInicial = Math.max(0, e.valorCuotasIniciales - e.recaudoCuotaInicial);
    return {
      etapa,
      uniTotales: e.uniTotales,
      uniVendidasFidu: e.uniVendidasFidu,
      uniVendidasCRM: e.uniVendidasCRM,
      uniDisponible: e.uniTotales - e.uniVendidasFidu,
      valorTotalVenta,
      valorTotalVentasFiduciaria: e.valorTotalVentasFiduciaria,
      valorCuotasIniciales: e.valorCuotasIniciales,
      valorTotalUnidadesDisponibles: e.valorTotalUnidadesDisponibles,
      recaudoReal: e.recaudoReal,
      recaudoCuotaInicial: e.recaudoCuotaInicial,
      recaudoCredito: e.recaudoReal - e.recaudoCuotaInicial,
      esperadoAFechaInicial: e.esperadoAFechaInicial,
      pctRecaudoSobreVentasFiduciaria: e.valorTotalVentasFiduciaria > 0 ? e.recaudoReal / e.valorTotalVentasFiduciaria : null,
      pctRecaudoSobreCuotaInicial: e.valorCuotasIniciales > 0 ? e.recaudoCuotaInicial / e.valorCuotasIniciales : null,
      carteraMas5Dias: e.carteraMas5Dias,
      pctCarteraMas5Dias: e.esperadoAFechaInicial > 0 ? e.carteraMas5Dias / e.esperadoAFechaInicial : null,
      // Recaudado y pendientes son de los negocios VENDIDOS: la resta de las columnas de al lado (valor ventas fiduciaria,
      // valor cuotas iniciales y lo recaudado). Las unidades disponibles no tienen recaudo ni pendiente.
      pendienteTotalFiduciaria: pendienteTotal,
      pendienteCuotaInicial: pendienteCuotaInicial,
      pendienteCredito: Math.max(0, pendienteTotal - pendienteCuotaInicial),
      fechaCorte,
    };
  });

  const total = etapas.reduce((acc, e) => {
    for (const key of CAMPOS_SUMABLES_TOTAL) acc[key] = (acc[key] ?? 0) + (e[key] ?? 0);
    return acc;
  }, {});
  Object.assign(total, {
    etapa: 'TOTAL GENERAL',
    uniDisponible: total.uniTotales - total.uniVendidasFidu,
    pctRecaudoSobreVentasFiduciaria: total.valorTotalVentasFiduciaria > 0 ? total.recaudoReal / total.valorTotalVentasFiduciaria : null,
    pctRecaudoSobreCuotaInicial: total.valorCuotasIniciales > 0 ? total.recaudoCuotaInicial / total.valorCuotasIniciales : null,
    pctCarteraMas5Dias: total.esperadoAFechaInicial > 0 ? total.carteraMas5Dias / total.esperadoAFechaInicial : null,
    fechaCorte: null,
  });

  return { etapas, total, fechaCorte };
}

function mesKeyDeFecha(fecha) {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mesAnteriorKey(fecha = new Date()) {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() - 1, 1));
  return mesKeyDeFecha(d);
}

const MESES_ETIQUETA = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function etiquetaMes(mk) {
  const [anio, mes] = mk.split('-');
  return `${MESES_ETIQUETA[parseInt(mes, 10) - 1]} ${anio}`;
}

async function obtenerMesesDisponiblesResumen() {
  const cerrados = await ResumenCarteraMensual.findAll({ attributes: ['mes'], order: [['mes', 'ASC']] });
  const mesActual = mesKeyDeFecha(new Date());
  const meses = cerrados.map((r) => ({ mes: r.mes, etiqueta: etiquetaMes(r.mes), enVivo: false }));
  meses.push({ mes: mesActual, etiqueta: etiquetaMes(mesActual), enVivo: true });
  return meses;
}

async function obtenerResumenCarteraMes(mes) {
  const mesActual = mesKeyDeFecha(new Date());
  if (!mes || mes === mesActual) {
    const datos = await obtenerResumenPorEtapa();
    return { ...datos, mes: mesActual, etiqueta: etiquetaMes(mesActual), enVivo: true };
  }
  const fila = await ResumenCarteraMensual.findOne({ where: { mes } });
  if (!fila) return null;
  return { ...fila.datos, mes: fila.mes, etiqueta: etiquetaMes(fila.mes), enVivo: false };
}

// Cierra el mes anterior si todavía no tiene foto guardada. Sin cron
// todavía (ver hoja de ruta, fase de cron jobs) -- se expone un trigger
// manual (POST /negocios/resumen-etapas/cerrar-mes) mientras tanto.
async function cerrarMesAnteriorSiFalta() {
  const mes = mesAnteriorKey();
  const yaExiste = await ResumenCarteraMensual.findOne({ where: { mes } });
  if (yaExiste) return null;
  const datos = await obtenerResumenPorEtapa();
  return ResumenCarteraMensual.create({ mes, datos });
}

async function obtenerStats() {
  const [totalInmuebles, total, conSaldo, saldoAgg, porEstadoRaw, { porEtapa, porFrente }] = await Promise.all([
    sequelize.query(
      `SELECT COUNT(*)::int AS total FROM inventario_items
       WHERE COALESCE(datos->>'Proyecto_Torre','') <> ALL($1::text[]) AND nombre NOT LIKE '*%'`,
      { bind: [[...PROYECTO_TORRE_EXCLUIDOS]], type: QueryTypes.SELECT }
    ).then((r) => r[0]?.total ?? 0),
    Negocio.count(),
    Negocio.count({ where: { saldo_actual: { [Op.gt]: 0 } } }),
    Negocio.sum('saldo_actual'),
    sequelize.query(
      `SELECT COALESCE(estado, 'Sin estado') AS estado, COUNT(*)::int AS count, COALESCE(SUM(saldo_actual), 0)::float AS saldo
       FROM negocios GROUP BY estado ORDER BY COUNT(*) DESC`,
      { type: QueryTypes.SELECT }
    ),
    estadisticasPorEtapaYFrente(),
  ]);

  return {
    totalInmuebles,
    totalNegocios: total,
    conSaldo,
    saldoTotal: saldoAgg ?? 0,
    porEstado: porEstadoRaw.map((r) => ({ estado: r.estado, count: Number(r.count), saldo: Number(r.saldo) })),
    porEtapa,
    porFrente,
  };
}

// Negocios agrupados por Etapa y por Frente -- mismo criterio de cruce
// Negocio<->InventarioItem que el resto del servicio (Referencia de Recaudo,
// con respaldo por Nomenclatura<->Código de inmueble).
async function estadisticasPorEtapaYFrente() {
  const rows = await sequelize.query(
    `SELECT n.estado, n.saldo_actual, inv.datos->>'Proyecto_Torre' AS proyecto_torre
     FROM negocios n
     LEFT JOIN vinculos_negocio_inmueble v ON v.referencia = n.referencia
     LEFT JOIN inventario_items inv ON inv.id = v.inventario_id
     WHERE inv.datos->>'Proyecto_Torre' IS NULL OR inv.datos->>'Proyecto_Torre' <> ALL($1::text[])`,
    { bind: [[...PROYECTO_TORRE_EXCLUIDOS]], type: QueryTypes.SELECT }
  );

  const porEtapa = new Map();
  const porFrente = new Map();
  const SIN_PROYECTO = 'Sin proyecto';
  for (const r of rows) {
    const info = parseProyectoTorre(r.proyecto_torre);
    const etapa = info ? obtenerEtapaTorre(r.proyecto_torre) : SIN_PROYECTO;
    const frente = info ? info.proyecto : SIN_PROYECTO;
    const saldo = Number(r.saldo_actual || 0);

    if (!porEtapa.has(etapa)) porEtapa.set(etapa, { count: 0, saldo: 0 });
    const pe = porEtapa.get(etapa);
    pe.count += 1;
    pe.saldo += saldo;

    if (!porFrente.has(frente)) porFrente.set(frente, { count: 0, saldo: 0 });
    const pf = porFrente.get(frente);
    pf.count += 1;
    pf.saldo += saldo;
  }

  return {
    porEtapa: [...porEtapa.entries()].sort((a, b) => compararEtapas(a[0], b[0])).map(([etapa, v]) => ({ etapa, count: v.count, saldo: v.saldo })),
    porFrente: [...porFrente.entries()].sort((a, b) => b[1].count - a[1].count).map(([frente, v]) => ({ frente, count: v.count, saldo: v.saldo })),
  };
}

// Dos números para el encabezado de "Resumen Gerencial" (Recaudado en el año
// / Separaciones este mes). Recaudado en el año REUTILIZA meses/totales de
// obtenerDashboardRecaudo -- no una suma propia de movimientos crudos: el
// legado sumaba directo sobre NegocioMovimiento (incluyendo "GENERADO POR
// VENTA UNIDAD", el asiento negativo de venta que no es plata real) y
// mostraba $20.778M mientras el gráfico de esa misma pantalla, con la
// conciliación real, sumaba $47.014M para el mismo año -- 2.3x de
// diferencia, uno al lado del otro. Con una sola fuente de verdad ya no se
// puede volver a desincronizar.
async function obtenerResumenStats() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = ahora.getMonth();

  const [dash, separacionesMes] = await Promise.all([
    obtenerDashboardRecaudo({ page: 1, limit: 1 }),
    Oportunidad.count({ where: { pago_separacion: { [Op.gte]: new Date(anio, mes, 1), [Op.lt]: new Date(anio, mes + 1, 1) } } }),
  ]);

  const recaudoAnio = dash.meses
    .filter((m) => m.startsWith(String(anio)))
    .reduce((s, m) => s + (dash.totales[m]?.recaudado ?? 0), 0);

  return { recaudoAnio, separacionesMes };
}

module.exports = {
  resolverValorVenta,
  precalentarCache: obtenerCache,
  resolverNegociosYOportunidades,
  obtenerDashboardRecaudo,
  obtenerCarteraMora,
  obtenerResumenPorEtapa,
  obtenerMesesDisponiblesResumen,
  obtenerResumenCarteraMes,
  cerrarMesAnteriorSiFalta,
  obtenerStats,
  obtenerResumenStats,
  invalidarCacheDashboard,
};
