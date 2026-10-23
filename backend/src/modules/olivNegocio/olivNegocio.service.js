// "Negocio" de Oliv = vista compuesta armada en vivo desde OlivInmueble +
// olivOportunidad (vinculados por `inmueble_hubspot_id`, resuelto en sync
// via la Associations API nativa de HubSpot -- verificada más confiable que
// cruzar por `unit_id` de la cotización del Cotizador de Cuotas: funciona
// incluso sin cotización aceptada -- ver olivOportunidad.sync.js) +
// cotización aceptada en Centro Aplicaciones Comerciales + Excel de
// Encargos ("Saldos Acumulados por Concepto y Unidad", ver
// olivEncargo.upload.js). No es una tabla nueva ni algo que se sincroniza
// aparte.
//
// Conciliación (2026-09-14): el Excel de Encargos es un ACUMULADO (fila de
// Aportes totales por negocio, SIN fecha por pago) -- no un histórico de
// movimientos fecha por fecha, así que no se puede
// calcular una conciliación exacta (cuál cuota puntual del plan está
// pagada/atrasada). Pedido explícito del usuario, confirmado tras
// preguntarle: se calcula una conciliación APROXIMADA reusando el mismo
// motor de Baía Kristal (`conciliar()`, ver dashboard/conciliacion.js) --
// se trata el total de Aportes como un solo pago sin fecha real, aplicado
// en orden contra el plan de pagos de la cotización aceptada. El resultado
// va marcado `aproximada: true` para que el frontend avise que no es
// exacta.
//
// Mismo criterio que negocio.servicio.js de Baía Kristal (InventarioItem +
// Negocio, con "huérfanos" en ambos sentidos): la lista sale de TODOS los
// inmuebles de Oliv, no solo los que ya tienen negocio -- pedido explícito
// del usuario: "vas a cargar todos los inmuebles como los hace Baia Kristal
// y luego enlazarlos, no solo colocar los negocios activos". A diferencia
// de Baía Kristal (CTE en SQL crudo con JOIN LATERAL sobre ~1900 inmuebles,
// necesario ahí por volumen), ahí el cruce se hace en JS: Oliv tiene ~100
// inmuebles y ~20-50 negocios calificados, un volumen donde no hace falta
// esa complejidad solo por rendimiento.
const { lista } = require('../../utils/filtros');
const { Op } = require('sequelize');
const ApiError = require('../../utils/ApiError');
const centroAplicacionesDb = require('../../utils/centroAplicacionesDb');
const { limpiarNombreContacto, ETAPA_MINIMA_ORDER } = require('../../utils/olivHelpers');
const { resumenFiduciarioTodos, resumenFiduciarioDeReferencia, conciliacionAproximada } = require('./olivFiducia.service');
const olivOportunidad = require('../olivOportunidad/olivOportunidad.model');
const OlivInmueble = require('../olivInmueble/olivInmueble.model');

function _mapInmueble(row) {
  if (!row) return null;
  return {
    id: row.id,
    hubspotId: row.hubspot_id,
    codigoUnidad: row.codigo_unidad,
    torre: row.torre,
    piso: row.piso,
    categoria: row.categoria,
    tipoApartamento: row.tipo_apartamento,
    estado: row.estado,
    valorComercial: row.valor_comercial,
    valorM2: row.valor_m2,
    areaConstruida: row.area_construida,
    areaPrivada: row.area_privada,
    areaTerraza: row.area_terraza,
    alcobas: row.alcobas,
    banos: row.banos,
    bono: row.bono,
    tipoVista: row.tipo_vista,
    planoLink: row.plano_link,
  };
}

// Id con prefijo según el lado que origina la fila (mismo patrón
// "inv-"/"neg-" que negocio.servicio.js de Baía Kristal, ahí "inm-"/"op-"):
// `inm-<id de OlivInmueble>` para toda unidad (con o sin negocio
// vinculado), `op-<id de olivOportunidad>` solo para el caso huérfano (un
// negocio calificado sin ninguna unidad asociada en HubSpot).
function _mapFila({ inmueble, oportunidad, fiducia }) {
  return {
    id: inmueble ? `inm-${inmueble.id}` : `op-${oportunidad.id}`,
    tieneInmueble: !!inmueble,
    tieneNegocio: !!oportunidad,
    unidad: inmueble?.codigo_unidad ?? null,
    torre: inmueble?.torre ?? null,
    // Estado del INMUEBLE (Disponible/Reservado/Separado/Vendido, propiedad
    // de HubSpot) -- distinto de `estado`, que es la etapa del negocio
    // (deal.stage). Pedido explícito del usuario: filtro de Torre
    // (LIVA/SEIVA) y "el estado del inmueble" en negocios.
    estadoInmueble: inmueble?.estado ?? null,
    // camelCase, no `Referencia` con mayúscula -- bug real encontrado
    // 2026-09-25 (Jefe Gabriel: "los negocios tienen referencia de recaudo
    // pero sigue saliendo — en el detalle"): el frontend SIEMPRE lee
    // `negocio.referencia` (`OlivNegociosSidebar.jsx`/
    // `OlivNegocioDetalleContenido.jsx`), así que el campo con mayúscula
    // nunca lo leía nadie -- en el sidebar el síntoma quedaba tapado por el
    // fallback a `unidad`, pero el header del detalle no tiene ese fallback.
    referencia: oportunidad?.referencia_recaudo || oportunidad?.deal_name || inmueble?.codigo_unidad || null,
    comprador: oportunidad ? limpiarNombreContacto(oportunidad.nombre_contacto, oportunidad.proyecto) : null,
    estado: oportunidad?.stage ?? null,
    // Aportes reales del Excel "Saldos Acumulados" (ver arriba) -- null
    // hasta que exista un negocio de HubSpot con Referencia de Recaudo que
    // cruce con la columna ENCARGO del Excel.
    totalMovimientos: fiducia?.movimientos.length ?? 0,
    saldoActual: fiducia?.aportes ?? null,
  };
}

async function list({ search, estado, torre, estadoInmueble, page = 1, limit = 50 }) {
  const [inmuebles, oportunidades, fiduciaPorReferencia] = await Promise.all([
    OlivInmueble.findAll({
      order: [
        ['torre', 'ASC'],
        ['codigo_unidad', 'ASC'],
      ],
    }),
    olivOportunidad.findAll({ where: { stage_order: { [Op.gte]: ETAPA_MINIMA_ORDER } } }),
    resumenFiduciarioTodos(),
  ]);

  const oportunidadPorInmueble = new Map();
  for (const op of oportunidades) {
    if (op.inmueble_hubspot_id && !oportunidadPorInmueble.has(op.inmueble_hubspot_id)) {
      oportunidadPorInmueble.set(op.inmueble_hubspot_id, op);
    }
  }
  const inmuebleHubspotIds = new Set(inmuebles.map((im) => im.hubspot_id));

  let filas = [
    ...inmuebles.map((im) => {
      const oportunidad = oportunidadPorInmueble.get(im.hubspot_id) ?? null;
      const fiducia = oportunidad?.referencia_recaudo ? fiduciaPorReferencia.get(oportunidad.referencia_recaudo) : null;
      return _mapFila({ inmueble: im, oportunidad, fiducia });
    }),
    ...oportunidades
      .filter((op) => !op.inmueble_hubspot_id || !inmuebleHubspotIds.has(op.inmueble_hubspot_id))
      .map((op) => _mapFila({ inmueble: null, oportunidad: op, fiducia: op.referencia_recaudo ? fiduciaPorReferencia.get(op.referencia_recaudo) : null })),
  ];

  const estadosDisponibles = [...new Set(oportunidades.map((op) => op.stage).filter(Boolean))].sort();
  const torresDisponibles = [...new Set(inmuebles.map((im) => im.torre).filter(Boolean))].sort();
  const estadosInmuebleDisponibles = [...new Set(inmuebles.map((im) => im.estado).filter(Boolean))].sort();

  const estados = lista(estado);
  const torres = lista(torre);
  const estadosInm = lista(estadoInmueble);
  if (estados.length) filas = filas.filter((f) => estados.includes(f.estado));
  if (torres.length) filas = filas.filter((f) => torres.includes(f.torre));
  if (estadosInm.length) filas = filas.filter((f) => estadosInm.includes(f.estadoInmueble));
  if (search) {
    const q = search.toLowerCase();
    filas = filas.filter((f) => [f.referencia, f.comprador, f.unidad, f.torre].some((v) => v && String(v).toLowerCase().includes(q)));
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const total = filas.length;
  const data = filas.slice((pageNum - 1) * limitNum, pageNum * limitNum);
  const sinFiltros = !search && !estado && !torre && !estadoInmueble;

  return {
    data,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    ...(sinFiltros ? { estados: estadosDisponibles, torres: torresDisponibles, estadosInmueble: estadosInmuebleDisponibles } : {}),
  };
}

async function getById(id) {
  let inmueble = null;
  let oportunidad = null;

  if (id.startsWith('inm-')) {
    inmueble = await OlivInmueble.findByPk(id.slice(4));
    if (!inmueble) throw new ApiError(404, 'Negocio no encontrado');
    oportunidad = await olivOportunidad.findOne({
      where: { inmueble_hubspot_id: inmueble.hubspot_id, stage_order: { [Op.gte]: ETAPA_MINIMA_ORDER } },
      order: [['actualizado_en', 'DESC']],
    });
  } else if (id.startsWith('op-')) {
    oportunidad = await olivOportunidad.findByPk(id.slice(3));
    if (!oportunidad) throw new ApiError(404, 'Negocio no encontrado');
    if (oportunidad.inmueble_hubspot_id) {
      inmueble = await OlivInmueble.findOne({ where: { hubspot_id: oportunidad.inmueble_hubspot_id } });
    }
  } else {
    throw new ApiError(404, 'Negocio no encontrado');
  }

  const [cotizacionRaw, fiducia] = await Promise.all([
    oportunidad ? centroAplicacionesDb.getCotizacionAceptada(oportunidad.hubspot_id).catch(() => null) : null,
    resumenFiduciarioDeReferencia(oportunidad?.referencia_recaudo),
  ]);
  const cotizacion = centroAplicacionesDb.mapCotizacion(cotizacionRaw);

  return {
    id: inmueble ? `inm-${inmueble.id}` : `op-${oportunidad.id}`,
    hubspotId: oportunidad?.hubspot_id ?? null,
    tieneNegocio: !!oportunidad,
    tieneInmueble: !!inmueble,
    referencia: oportunidad?.referencia_recaudo || oportunidad?.deal_name || inmueble?.codigo_unidad || null,
    referenciaRecaudo: oportunidad?.referencia_recaudo ?? null,
    estado: oportunidad?.stage ?? null,
    proyecto: oportunidad?.proyecto ?? inmueble?.proyecto ?? null,
    ultimoSyncEn: oportunidad?.ultimo_sync_en ?? inmueble?.ultimo_sync_en ?? null,
    comprador: oportunidad
      ? {
          nombre: limpiarNombreContacto(oportunidad.nombre_contacto, oportunidad.proyecto),
          email: oportunidad.email || cotizacion?.contactoSnapshot?.email || null,
          telefono: oportunidad.telefono || cotizacion?.contactoSnapshot?.telefono || null,
          // La cédula del Excel de fiducia (IDENTIFICACION) es más confiable
          // que la del snapshot de la cotización -- viene de la fiduciaria
          // misma, no de lo que el asesor cargó al cotizar.
          cedula: fiducia?.identificacion || cotizacion?.contactoSnapshot?.cedula || null,
        }
      : null,
    inmueble: _mapInmueble(inmueble),
    // "Total abonado" = Aportes reales del Excel de fiducia -- Rendimientos
    // Brutos ya no se importa en absoluto (ver el comentario de cabecera).
    totalAbonado: fiducia?.aportes ?? null,
    totalMovimientos: fiducia?.movimientos.length ?? 0,
    estructuraFinanciera: fiducia
      ? { aportes: fiducia.aportes, valorUnidadFiducia: fiducia.valorUnidad }
      : null,
    historialMovimientos: fiducia?.movimientos ?? [],
    conciliacion: conciliacionAproximada(cotizacion, fiducia),
    cotizacionAceptada: cotizacion,
  };
}

module.exports = { list, getById };
