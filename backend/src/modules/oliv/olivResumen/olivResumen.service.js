// Resumen Gerencial de Oliv (Jefe Gabriel, 2026-09-25: "la idea es que sea
// como en Baía Kristal, tal cual") -- puerto de `dashboard/dashboard.service.js`
// (el servicio más grande e importante de Baía Kristal), adaptado a lo que
// Oliv realmente tiene:
//
//   - Sin jerarquía Etapa->Frente->Torre (Oliv es un solo proyecto) -- el
//     "Consolidado de Cartera" agrupa por TORRE (LIVA/SEIVA), no por Etapa
//     constructiva. Decisión confirmada explícitamente con el usuario (dio a
//     elegir Torre / una sola fila / por Estado del inmueble -- Torre fue la
//     elegida).
//   - Sin `Negocio` como tabla propia -- "negocio" de Oliv es la vista
//     compuesta de `olivNegocio.service.js` (Inmueble + Oportunidad +
//     cotización + fiducia). El universo base es TODO `OlivInmueble` +
//     huérfanos de `olivOportunidad` (mismo criterio que
//     `olivNegocio.service.js#list()`).
//   - Sin distinción CRM-vendida vs Fiducia-vendida (Baía Kristal SÍ la
//     tiene, `ESTADOS_NEGOCIO_VENDIDA_FIDU` vs `ESTADOS_INV_VENDIDA_CRM`,
//     porque tiene dos fuentes de estado independientes) -- Oliv solo tiene
//     UN estado real (`OlivInmueble.estado`: Disponible/Reservado/Separado/
//     Vendido), así que "vendida" es simplemente `estado === 'Vendido'`.
//   - Sin "Valor Factura" vs "Valor venta" por etapas en entrega (regla
//     específica de Kabo/Prive en Baía Kristal, sin equivalente en Oliv) --
//     `valorInmueble` sale siempre del total de la cotización aceptada
//     (`resumen.totalPlan`), igual que el resto del plan.
//   - Conciliación APROXIMADA (`olivFiducia.service.js#conciliacionAproximada`,
//     ya usada por `olivNegocio.service.js`): el Excel de Encargos es un
//     acumulado sin fecha por pago real, así que los "pagos" son los
//     movimientos de Aportes con la fecha del Excel que los trajo, no una
//     fecha de transacción real -- mismo motivo por el que
//     `olivNegocio.service.js` ya lo hace así.
//   - La última cuota del plan de la cotización ("Saldo final" en el
//     lenguaje real de Oliv, no "Saldo Contraentrega") juega el mismo rol
//     que la última cuota en Baía Kristal -- los campos de la API se llaman
//     igual (`valorSaldoContraentrega`, `porMesContraentrega`, etc.) para
//     poder reusar el MISMO frontend (`EsperadoRecaudadoChart`, tiles, etc.)
//     sin reescribirlo; lo que cambia es solo el texto visible.
const { lista } = require('../../../utils/filtros');
const { Op } = require('sequelize');
const { conciliar, mesKey, diaKey, periodoVacio, acumularPorPeriodo } = require('../../baiaKristal/baiaDashboard/conciliacion');
const centroAplicacionesDb = require('../../../utils/centroAplicacionesDb');
const { limpiarNombreContacto, ETAPA_MINIMA_ORDER, ETAPA_8_STAGE_ID } = require('../../../utils/olivHelpers');
const { resumenFiduciarioTodos, conciliacionAproximada } = require('../olivNegocio/olivFiducia.service');
const olivOportunidad = require('../olivOportunidad/olivOportunidad.model');
const OlivInmueble = require('../olivInmueble/olivInmueble.model');
const OlivResumenMensual = require('./olivResumenMensual.model');
const { getCache, getEnConstruccion, setCache, setEnConstruccion, invalidarCacheResumenOliv } = require('./olivResumenCache');

// 'AAAA-MM-DD' del instante dado en hora de Bogotá (null si no hay fecha válida).
function diaBogota(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

async function construirFilasCompletas() {
  const [inmuebles, oportunidades, fiduciaPorReferencia] = await Promise.all([
    OlivInmueble.findAll({ order: [['torre', 'ASC'], ['codigo_unidad', 'ASC']], raw: true }),
    olivOportunidad.findAll({ where: { stage_order: { [Op.gte]: ETAPA_MINIMA_ORDER } }, raw: true }),
    resumenFiduciarioTodos(),
  ]);

  const oportunidadPorInmueble = new Map();
  for (const op of oportunidades) {
    if (op.inmueble_hubspot_id && !oportunidadPorInmueble.has(op.inmueble_hubspot_id)) {
      oportunidadPorInmueble.set(op.inmueble_hubspot_id, op);
    }
  }
  const inmuebleHubspotIds = new Set(inmuebles.map((im) => im.hubspot_id));

  // Cotizaciones aceptadas: una llamada por Oportunidad con referencia (a
  // Centro Aplicaciones Comerciales) -- volumen chico de Oliv (~20-50
  // negocios calificados), no vale la pena optimizar a una sola query
  // batched (ese endpoint no la ofrece hoy).
  const cotizacionPorOportunidadId = new Map();
  await Promise.all(
    oportunidades.map(async (op) => {
      const raw = await centroAplicacionesDb.getCotizacionAceptada(op.hubspot_id).catch(() => null);
      const mapeada = centroAplicacionesDb.mapCotizacion(raw);
      if (mapeada) cotizacionPorOportunidadId.set(op.id, mapeada);
    })
  );

  function filaDeOportunidad({ inmueble, oportunidad }) {
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
    let tieneMovimientos = false;

    if (oportunidad) {
      const referencia = oportunidad.referencia_recaudo;
      const fiducia = referencia ? fiduciaPorReferencia.get(referencia) : null;
      tieneMovimientos = (fiducia?.movimientos.length ?? 0) > 0;
      const cotizacion = cotizacionPorOportunidadId.get(oportunidad.id) ?? null;
      const conciliacion = conciliacionAproximada(cotizacion, fiducia);

      if (conciliacion) {
        const { cuotas, resumen } = conciliacion;
        valorInmueble = resumen.totalPlan;
        const ultimaCuota = cuotas[cuotas.length - 1];
        fechaSaldoContraentrega = ultimaCuota?.fechaEstimada ?? null;
        valorSaldoContraentrega = ultimaCuota?.valorPlan ?? null;
        const cuotasCuotaInicial = cuotas.slice(0, -1);
        valorCuotaInicial = cuotasCuotaInicial.length > 0 ? cuotasCuotaInicial.reduce((s, c) => s + c.valorPlan, 0) : null;
        abonadoCuotaInicial = cuotasCuotaInicial.length > 0 ? cuotasCuotaInicial.reduce((s, c) => s + c.cubierto, 0) : null;

        totalAbonado = resumen.totalPagado;
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

        if (ultimaCuota?.atrasada) {
          const pendiente = Math.max(0, ultimaCuota.valorPlan - ultimaCuota.cubierto);
          if (pendiente > 1000) {
            saldoContraentregaVencido = true;
            pendienteSaldoContraentrega = pendiente;
            diasAtrasoSaldoContraentrega = ultimaCuota.diasAtraso;
          }
        }

        const pagos = (fiducia?.pagos ?? [])
          .map((p) => ({ id: p.id, valor: p.valor, fecha: p.fecha ? new Date(p.fecha) : null }))
          .sort((a, b) => {
            if (!a.fecha && !b.fecha) return 0;
            if (!a.fecha) return 1;
            if (!b.fecha) return -1;
            return a.fecha - b.fecha;
          });
        const paramsAcumular = { cuotas, cuotasCuotaInicial, ultimaCuota, pagos, resumen };
        acumularPorPeriodo({ ...paramsAcumular, keyFn: mesKey, porPeriodo: porMes, porPeriodoInicial: porMesInicial, porPeriodoContraentrega: porMesContraentrega });
        acumularPorPeriodo({ ...paramsAcumular, keyFn: diaKey, porPeriodo: porDia, porPeriodoInicial: porDiaInicial, porPeriodoContraentrega: porDiaContraentrega });
      }
    }

    if (valorInmueble == null && inmueble?.valor_comercial != null) valorInmueble = Number(inmueble.valor_comercial);

    return {
      id: inmueble ? `inm-${inmueble.id}` : `op-${oportunidad.id}`,
      torre: inmueble?.torre ?? null,
      unidad: inmueble?.codigo_unidad ?? null,
      valorInmueble,
      valorCuotaInicial,
      abonadoCuotaInicial,
      fechaSaldoContraentrega,
      valorSaldoContraentrega,
      totalAbonado,
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
      // `id` (arriba) ya es el id compuesto que usa la ruta de detalle de
      // Negocio (`inm-<id>`/`op-<id>`, ver olivNegocio.service.js) -- estos
      // dos son los ids CRUDOS de cada entidad, para los links "Ver
      // inmueble"/"Ver oportunidad" del menú contextual del Dashboard, que
      // apuntan a rutas propias de cada una (`/oliv/inmuebles/:id`,
      // `/oliv/oportunidades/:id`), no a la de Negocio.
      inmuebleId: inmueble?.id ?? null,
      oportunidadId: oportunidad?.id ?? null,
      referencia: oportunidad?.referencia_recaudo || oportunidad?.deal_name || inmueble?.codigo_unidad || null,
      // La referencia de recaudo REAL, sin el respaldo de nombre/código de arriba --
      // Cartera en Gestión la muestra vacía si el negocio no tiene una.
      referenciaRecaudo: oportunidad?.referencia_recaudo || null,
      comprador: oportunidad ? limpiarNombreContacto(oportunidad.nombre_contacto, oportunidad.proyecto) : null,
      estado: oportunidad?.stage ?? null,
      estadoInventario: inmueble?.estado ?? null,
      // Informe de Cartera (Cartera en Gestión): vista y área privada del inmueble, y la fecha de contrato =
      // fecha en que la oportunidad entró a Etapa 8 (como día calendario de Bogotá, 'AAAA-MM-DD').
      vista: inmueble?.tipo_vista ?? null,
      // Valor m² del INMUEBLE tal cual está en HubSpot (Cartera en Gestión).
      valorM2Hubspot: inmueble?.valor_m2 != null && !Number.isNaN(Number(inmueble.valor_m2)) ? Number(inmueble.valor_m2) : null,
      area: inmueble?.area_construida != null && !Number.isNaN(Number(inmueble.area_construida)) ? Number(inmueble.area_construida) : null, // área CONSTRUIDA (antes tomaba la privada)
      fechaContrato: diaBogota(oportunidad?.propiedades?.[`hs_v2_date_entered_${ETAPA_8_STAGE_ID}`]),
      _tieneMovimientos: tieneMovimientos,
      porMes,
      porMesInicial,
      porMesContraentrega,
      porDia,
      porDiaInicial,
      porDiaContraentrega,
    };
  }

  const filas = [
    ...inmuebles.map((im) => filaDeOportunidad({ inmueble: im, oportunidad: oportunidadPorInmueble.get(im.hubspot_id) ?? null })),
    ...oportunidades
      .filter((op) => !op.inmueble_hubspot_id || !inmuebleHubspotIds.has(op.inmueble_hubspot_id))
      .map((op) => filaDeOportunidad({ inmueble: null, oportunidad: op })),
  ];

  const torres = [...new Set(inmuebles.map((im) => im.torre).filter(Boolean))].sort();
  const estadosInmueble = [...new Set(inmuebles.map((im) => im.estado).filter(Boolean))].sort();

  return { filas, torres, estadosInmueble };
}

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

const CAMPOS_ORDENABLES = new Set([
  'torre', 'unidad', 'valorInmueble', 'valorCuotaInicial', 'abonadoCuotaInicial',
  'totalAbonado', 'pendienteRecaudar', 'cuotasEnMora', 'montoEnMora',
  'fechaSaldoContraentrega', 'valorSaldoContraentrega',
]);
const CAMPOS_NUMERICOS = new Set([
  'valorInmueble', 'valorCuotaInicial', 'abonadoCuotaInicial', 'totalAbonado', 'pendienteRecaudar',
  'cuotasEnMora', 'montoEnMora', 'valorSaldoContraentrega',
]);

function ordenar(filas, sortBy, sortDir) {
  if (!CAMPOS_ORDENABLES.has(sortBy) || (sortDir !== 'asc' && sortDir !== 'desc')) return filas;
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
    if (sortBy === 'fechaSaldoContraentrega') return dir * (new Date(va) - new Date(vb));
    if (CAMPOS_NUMERICOS.has(sortBy)) return dir * (va - vb);
    return dir * String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
  });
}

async function obtenerDashboardRecaudo({ search, torre, estadoInmueble, conMovimientos, sortBy, sortDir, page, limit }) {
  const { filas: todasLasFilas, torres, estadosInmueble } = await obtenerCache();

  let filas = todasLasFilas;
  if (search) {
    const s = search.toLowerCase();
    filas = filas.filter((f) => f.unidad?.toLowerCase().includes(s) || f.referencia?.toLowerCase().includes(s) || f.comprador?.toLowerCase().includes(s) || f.torre?.toLowerCase().includes(s));
  }
  if (lista(torre).length) filas = filas.filter((f) => lista(torre).includes(f.torre));
  if (lista(estadoInmueble).length) filas = filas.filter((f) => lista(estadoInmueble).includes(f.estadoInventario));
  if (conMovimientos === 'true') filas = filas.filter((f) => f._tieneMovimientos);
  filas = ordenar(filas, sortBy, sortDir);

  const mesesSet = new Set();
  const totalesPorMes = new Map();
  const totalesPorMesInicial = new Map();
  const totalesPorMesContraentrega = new Map();
  const totalesPorTorre = new Map();
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

    if (f.estadoInventario === 'Vendido') {
      if (f.valorInmueble != null) totalesColumnasFijas.valorVendidos += f.valorInmueble;
      totalesColumnasFijas.cantidadVendidos += 1;
    } else {
      if (f.valorInmueble != null) totalesColumnasFijas.valorDisponible += f.valorInmueble;
      totalesColumnasFijas.cantidadDisponible += 1;
    }

    for (const [mes, v] of Object.entries(f.porMes)) {
      mesesSet.add(mes);
      if (!totalesPorMes.has(mes)) totalesPorMes.set(mes, periodoVacio());
      const t = totalesPorMes.get(mes);
      t.esperado += v.esperado;
      t.recaudado += v.recaudado;
      t.porRecaudar += v.porRecaudar ?? 0;
      if (f.torre != null) {
        if (!totalesPorTorre.has(f.torre)) totalesPorTorre.set(f.torre, { esperado: 0, recaudado: 0 });
        const tt = totalesPorTorre.get(f.torre);
        tt.esperado += v.esperado;
        tt.recaudado += v.recaudado;
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

  const abonadoHaciaContraentrega = Math.max(0, totalesColumnasFijas.totalAbonado - totalesColumnasFijas.valorCuotaInicial);
  totalesColumnasFijas.pendienteRecaudar = Math.max(0, totalesColumnasFijas.valorInmueble - totalesColumnasFijas.totalAbonado);
  totalesColumnasFijas.pendienteContraentrega = Math.max(0, totalesColumnasFijas.valorSaldoContraentrega - abonadoHaciaContraentrega);
  totalesColumnasFijas.recaudadoContraentrega = Math.min(abonadoHaciaContraentrega, totalesColumnasFijas.valorSaldoContraentrega);

  const meses = [...mesesSet].sort();
  const totales = Object.fromEntries(meses.map((m) => [m, totalesPorMes.get(m)]));
  const totalesInicial = Object.fromEntries(meses.map((m) => [m, totalesPorMesInicial.get(m) ?? periodoVacio()]));
  const totalesContraentrega = Object.fromEntries(meses.map((m) => [m, totalesPorMesContraentrega.get(m) ?? periodoVacio()]));
  const torresOrdenadas = [...totalesPorTorre.keys()].sort();
  const totalesTorre = Object.fromEntries(torresOrdenadas.map((t) => [t, totalesPorTorre.get(t)]));

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
    totalesPorTorre: totalesTorre,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    torresDisponibles: torres,
    estadosInmuebleDisponibles: estadosInmueble,
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
  'torre', 'unidad', 'referencia', 'referenciaRecaudo', 'comprador', 'estado',
  'valorInmueble', 'cuotasEnMora', 'maxDiasAtraso', 'montoEnMora', 'pctEnMora',
  'fechaSaldoContraentrega',
  // Informe de Cartera
  'vista', 'area', 'fechaContrato', 'valorM2', 'valorCuotaInicial', 'credito', 'totalAbonado', 'pctRecaudo',
]);
const CAMPOS_NUMERICOS_MORA = new Set([
  'valorInmueble', 'cuotasEnMora', 'maxDiasAtraso', 'montoEnMora', 'pctEnMora',
  'area', 'valorM2', 'valorCuotaInicial', 'credito', 'totalAbonado', 'pctRecaudo',
]);

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
    if (sortBy === 'fechaSaldoContraentrega' || sortBy === 'fechaContrato') return dir * (new Date(va) - new Date(vb));
    if (CAMPOS_NUMERICOS_MORA.has(sortBy)) return dir * (va - vb);
    return dir * String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
  });
}

// "Cartera en Gestión" de Oliv -- equivalente a
// `dashboard.service.js#obtenerCarteraMora`. Sin `tramite`/`esCanje`: esos
// dos flags viven en `Negocio` (una tabla real, editable) en Baía Kristal;
// "negocio" de Oliv es una vista compuesta calculada en vivo
// (`olivNegocio.service.js`), sin ningún lugar donde persistir un flag por
// negocio -- se omite el filtro/las acciones de trámite/canje del todo, en
// vez de simularlas sin poder guardarlas de verdad.
async function obtenerCarteraMora({ search, torre, estadoInmueble, rango, vista, sortBy, sortDir, page, limit }) {
  const { filas: todasLasFilas, torres, estadosInmueble } = await obtenerCache();

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
    filas = filas.filter((f) => f.unidad?.toLowerCase().includes(s) || f.comprador?.toLowerCase().includes(s) || f.referencia?.toLowerCase().includes(s) || f.torre?.toLowerCase().includes(s));
  }
  if (lista(torre).length) filas = filas.filter((f) => lista(torre).includes(f.torre));
  if (lista(estadoInmueble).length) filas = filas.filter((f) => lista(estadoInmueble).includes(f.estadoInventario));

  const porRangoMoraMap = new Map(RANGOS_MORA.map((r) => [r.key, { count: 0, monto: 0 }]));
  for (const f of filas) {
    const b = porRangoMoraMap.get(claveRangoMora(f.maxDiasAtraso));
    b.count += 1;
    b.monto += f.montoEnMora;
  }
  const porRangoMora = RANGOS_MORA.map((r) => ({ rango: r.key, label: r.label, ...porRangoMoraMap.get(r.key) }));

  if (lista(rango).length) filas = filas.filter((f) => lista(rango).includes(claveRangoMora(f.maxDiasAtraso)));

  const totalCuotasEnMora = filas.reduce((s, f) => s + f.cuotasEnMora, 0);
  const totalMontoEnMora = filas.reduce((s, f) => s + f.montoEnMora, 0);
  const totalEsperadoAFecha = filas.reduce((s, f) => s + (f.esperadoAFecha ?? 0), 0);
  const pctMoraPortafolio = totalEsperadoAFecha > 0 ? (totalMontoEnMora / totalEsperadoAFecha) * 100 : null;

  // Informe de Cartera: el VALOR VENTA es el del plan de pagos (como siempre) y el VALOR M² el que trae el inmueble en
  // HubSpot, tal cual. Crédito = venta - cuota inicial y % de recaudo = abonado / venta (en puntos porcentuales).
  filas = filas.map((f) => ({
    ...f,
    pctEnMora: f.esperadoAFecha > 0 ? (f.montoEnMora / f.esperadoAFecha) * 100 : null,
    valorM2: f.valorM2Hubspot,
    credito: f.valorInmueble != null && f.valorCuotaInicial != null ? f.valorInmueble - f.valorCuotaInicial : null,
    pctRecaudo: f.valorInmueble > 0 && f.totalAbonado != null ? (f.totalAbonado / f.valorInmueble) * 100 : null,
  }));
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
    torresDisponibles: torres,
    estadosInmuebleDisponibles: estadosInmueble,
  };
}

// Dos números para el encabezado de "Resumen Gerencial" de Oliv (Recaudado
// en el año / Separaciones este mes) -- mismo criterio que
// `dashboard.service.js#obtenerResumenStats`: `recaudoAnio` REUTILIZA
// meses/totales de `obtenerDashboardRecaudo`, nunca una suma propia de
// movimientos crudos (evita la desincronización real que motivó esa regla
// en Baía Kristal, ver el comentario allá). `separacionesMes` usa
// `close_date` (HubSpot) como proxy de "Pago Separación" -- `olivOportunidad`
// no tiene un campo dedicado equivalente a `Oportunidad.pago_separacion` de
// Zoho todavía, `close_date` es el campo de fecha más cercano que ya se
// sincroniza.
async function obtenerResumenStats() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = ahora.getMonth();

  const [dash, separacionesMes] = await Promise.all([
    obtenerDashboardRecaudo({ page: 1, limit: 1 }),
    olivOportunidad.count({ where: { close_date: { [Op.gte]: new Date(anio, mes, 1), [Op.lt]: new Date(anio, mes + 1, 1) } } }),
  ]);

  const recaudoAnio = dash.meses
    .filter((m) => m.startsWith(String(anio)))
    .reduce((s, m) => s + (dash.totales[m]?.recaudado ?? 0), 0);

  return { recaudoAnio, separacionesMes };
}

const UMBRAL_CARTERA_DIAS = 5;

function acumuladoTorreVacio() {
  return {
    uniTotales: 0, uniVendidas: 0,
    valorTotalVentas: 0, valorCuotasIniciales: 0, valorTotalUnidadesDisponibles: 0,
    recaudoReal: 0, recaudoCuotaInicial: 0, carteraMas5Dias: 0, esperadoAFechaInicial: 0,
  };
}

const CAMPOS_SUMABLES_TOTAL = [
  'uniTotales', 'uniVendidas',
  'valorTotalVenta', 'valorTotalVentas', 'valorCuotasIniciales', 'valorTotalUnidadesDisponibles',
  'recaudoReal', 'recaudoCuotaInicial', 'carteraMas5Dias', 'esperadoAFechaInicial',
  'pendienteTotalFiduciaria', 'pendienteCuotaInicial', 'pendienteCredito',
];

// "Consolidado de Cartera por Torre" -- equivalente Oliv de
// `dashboard.service.js#obtenerResumenPorEtapa`. Una unidad "vendida" es la que tiene una
// Oportunidad asociada: `construirFilasCompletas` solo trae las de Etapa 8 en adelante
// (`ETAPA_MINIMA_ORDER`), y todo lo que está en Etapa 8+ es venta (Jefe Gabriel, 2026-10-16).
// Antes se contaba por `f.negocioId`, un campo que las filas NUNCA traen: ninguna torre tenía
// vendidas. Oliv no distingue estado-CRM vs estado-fiducia como Baía Kristal, así que no hay
// `uniVendidasFidu`/`uniVendidasCRM` separados, solo `uniVendidas`.
async function obtenerResumenPorTorre() {
  const { filas } = await obtenerCache();
  const porTorre = new Map();

  for (const f of filas) {
    if (f.torre == null) continue;
    if (!porTorre.has(f.torre)) porTorre.set(f.torre, acumuladoTorreVacio());
    const t = porTorre.get(f.torre);
    t.uniTotales += 1;
    const tieneNegocio = f.oportunidadId != null;
    if (tieneNegocio) t.uniVendidas += 1;

    if (tieneNegocio) {
      if (f.valorInmueble != null) t.valorTotalVentas += f.valorInmueble;
      if (f.valorCuotaInicial != null) t.valorCuotasIniciales += f.valorCuotaInicial;
      if (f.totalAbonado != null) t.recaudoReal += f.totalAbonado;
      if (f.abonadoCuotaInicial != null) t.recaudoCuotaInicial += f.abonadoCuotaInicial;
      if (f.esperadoAFechaInicial != null) t.esperadoAFechaInicial += f.esperadoAFechaInicial;
      if ((f.maxDiasAtrasoInicial ?? 0) > UMBRAL_CARTERA_DIAS) t.carteraMas5Dias += f.montoEnMoraInicial ?? 0;
    } else if (f.valorInmueble != null) {
      t.valorTotalUnidadesDisponibles += f.valorInmueble;
    }
  }

  const fechaCorte = new Date().toISOString();
  const torres = [...porTorre.keys()].sort().map((torre) => {
    const t = porTorre.get(torre);
    return {
      torre,
      uniTotales: t.uniTotales,
      uniVendidas: t.uniVendidas,
      uniDisponible: t.uniTotales - t.uniVendidas,
      valorTotalVenta: t.valorTotalVentas + t.valorTotalUnidadesDisponibles,
      valorTotalVentas: t.valorTotalVentas,
      valorCuotasIniciales: t.valorCuotasIniciales,
      valorTotalUnidadesDisponibles: t.valorTotalUnidadesDisponibles,
      recaudoReal: t.recaudoReal,
      recaudoCuotaInicial: t.recaudoCuotaInicial,
      esperadoAFechaInicial: t.esperadoAFechaInicial,
      pctRecaudoSobreVentasFiduciaria: t.valorTotalVentas > 0 ? t.recaudoReal / t.valorTotalVentas : null,
      pctRecaudoSobreCuotaInicial: t.valorCuotasIniciales > 0 ? t.recaudoReal / t.valorCuotasIniciales : null,
      carteraMas5Dias: t.carteraMas5Dias,
      pctCarteraMas5Dias: t.esperadoAFechaInicial > 0 ? t.carteraMas5Dias / t.esperadoAFechaInicial : null,
      pendienteTotalFiduciaria: Math.max(0, t.valorTotalVentas - t.recaudoReal),
      pendienteCuotaInicial: Math.max(0, t.valorCuotasIniciales - t.recaudoReal),
      pendienteCredito: Math.max(0, t.valorTotalVentas - t.recaudoReal) - Math.max(0, t.valorCuotasIniciales - t.recaudoReal),
      fechaCorte,
    };
  });

  const total = torres.reduce((acc, t) => {
    for (const key of CAMPOS_SUMABLES_TOTAL) acc[key] = (acc[key] ?? 0) + (t[key] ?? 0);
    return acc;
  }, {});
  Object.assign(total, {
    torre: 'TOTAL GENERAL',
    uniDisponible: total.uniTotales - total.uniVendidas,
    pctRecaudoSobreVentasFiduciaria: total.valorTotalVentas > 0 ? total.recaudoReal / total.valorTotalVentas : null,
    pctRecaudoSobreCuotaInicial: total.valorCuotasIniciales > 0 ? total.recaudoReal / total.valorCuotasIniciales : null,
    pctCarteraMas5Dias: total.esperadoAFechaInicial > 0 ? total.carteraMas5Dias / total.esperadoAFechaInicial : null,
    fechaCorte: null,
  });

  return { torres, total, fechaCorte };
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
  const cerrados = await OlivResumenMensual.findAll({ attributes: ['mes'], order: [['mes', 'ASC']] });
  const mesActual = mesKeyDeFecha(new Date());
  const meses = cerrados.map((r) => ({ mes: r.mes, etiqueta: etiquetaMes(r.mes), enVivo: false }));
  meses.push({ mes: mesActual, etiqueta: etiquetaMes(mesActual), enVivo: true });
  return meses;
}

async function obtenerResumenCarteraMes(mes) {
  const mesActual = mesKeyDeFecha(new Date());
  if (!mes || mes === mesActual) {
    const datos = await obtenerResumenPorTorre();
    return { ...datos, mes: mesActual, etiqueta: etiquetaMes(mesActual), enVivo: true };
  }
  const fila = await OlivResumenMensual.findOne({ where: { mes } });
  if (!fila) return null;
  return { ...fila.datos, mes: fila.mes, etiqueta: etiquetaMes(fila.mes), enVivo: false };
}

// Cierra el mes anterior si todavía no tiene foto guardada -- mismo patrón
// que `dashboard.service.js#cerrarMesAnteriorSiFalta` (sin cron todavía,
// trigger manual solo-admin).
async function cerrarMesAnteriorSiFalta() {
  const mes = mesAnteriorKey();
  const yaExiste = await OlivResumenMensual.findOne({ where: { mes } });
  if (yaExiste) return null;
  const datos = await obtenerResumenPorTorre();
  return OlivResumenMensual.create({ mes, datos });
}

module.exports = {
  precalentarCache: obtenerCache,
  obtenerDashboardRecaudo,
  obtenerResumenStats,
  obtenerResumenPorTorre,
  obtenerMesesDisponiblesResumen,
  obtenerResumenCarteraMes,
  cerrarMesAnteriorSiFalta,
  obtenerCarteraMora,
  invalidarCacheResumenOliv,
};
