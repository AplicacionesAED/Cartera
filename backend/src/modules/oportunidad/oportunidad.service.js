// Adaptado de la lógica que en el proyecto legado vivía directo en
// routes/opportunities.js.
const { Op, QueryTypes } = require('sequelize');
const axios = require('axios');
const sequelize = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const { getAccessToken } = require('../../utils/zohoAuth');
const zohoConfig = require('../../config/zoho');
const { ordenSequelize } = require('../../utils/ordenamiento');
const {
  valoresProyectoTorre,
  compararEtapas,
  esFrenteSeleccionable,
  SIN_PROYECTO,
  inmueblesPorReferencia,
  inmuebleDeFila,
  referenciasConOportunidadVigente,
  mapInmueble,
  referenciasPorProyectoTorre,
  referenciasSinProyecto,
  ordenLiteralInmueble,
} = require('../inventario/inventarioTorres.service');
const Oportunidad = require('./oportunidad.model');
const ZohoFieldMetadata = require('./zohoFieldMetadata.model');

// Whitelist de orden server-side (Jefe Gabriel 2026-09-25), mismo patrón que
// `otrosi.service.js#CAMPOS_ORDEN`. 'inmueble' no está acá a propósito -- no
// es una columna real de esta tabla, se resuelve aparte con
// `ordenLiteralInmueble()` (ver `list()`).
const CAMPOS_ORDEN = {
  id: 'id',
  dealName: 'deal_name',
  stage: 'stage',
  referenciaRecaudo: 'referencia_recaudo',
  pagoSeparacion: 'pago_separacion',
};

// `inmueble` es opcional (solo el listado lo resuelve, con una query batched
// por página -- ver `list()`); el detalle (`getById`) no lo necesita.
function _mapItem(row, inmueble = null) {
  return {
    id: row.id,
    zohoId: row.zoho_id,
    dealName: row.deal_name,
    stage: row.stage,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    accountName: row.account_name,
    referenciaRecaudo: row.referencia_recaudo,
    // Columna 'Inmueble', mismo criterio y mismo shape que Otrosíes (Jefe
    // Gabriel, 2026-09-25 -- ambas tablas deben verse iguales acá): `null`
    // cuando la referencia no matchea ningún `inventario_item`.
    inmueble,
    pagoSeparacion: row.pago_separacion,
    camposFinancieros: row.campos_financieros,
    ultimoSyncEn: row.ultimo_sync_en,
  };
}

function _mapDetalle(row) {
  return {
    ..._mapItem(row),
    contactId: row.contact_id,
    fechaInicioPlanPagos: row.fecha_inicio_plan_pagos,
    seccionInmueble: row.seccion_inmueble,
    seccionCotizacion: row.seccion_cotizacion,
    formaPago: row.forma_pago,
    propuestaPago: row.propuesta_pago,
  };
}

// Muestra todo lo sincronizado: el sync ya trae solo las oportunidades con Referencia de Recaudo o
// Fecha Vinculación Exitosa (2026-10-14; antes se filtraba aquí por Pago Separación).
// Búsqueda SIMPLE por substring: la tolerante (palabras + trigramas, con su
// orden por similitud) se revirtió el 2026-09-24 por decisión del Jefe Gabriel
// ("Busco nombres y me salen otros").
//
// Filtro en cascada Etapa -> Frente -> Torre (Jefe Gabriel, 2026-09-25),
// mismo criterio y mismos helpers compartidos que `otrosi.service.js`
// (`inventarioTorres.service.js`) -- Oportunidades tampoco tiene su propio
// Proyecto/Torre, así que se resuelve indirecto vía `referencia_recaudo`.
async function list({ stage, search, etapa, frente, torre, sortBy, sortDir, page = 1, limit = 20 }) {
  const where = {};
  if (stage) where.stage = stage;

  const valores = await valoresProyectoTorre();
  if (etapa || frente || torre) {
    if (etapa === SIN_PROYECTO) {
      const sinProyecto = await referenciasSinProyecto();
      const conProyecto = await referenciasPorProyectoTorre([...valores.porEtapa.values()].flat());
      where.referencia_recaudo = { [Op.or]: [{ [Op.is]: null }, { [Op.notIn]: conProyecto }, { [Op.in]: sinProyecto }] };
    } else {
      let proyectosTorre = [];
      if (frente && torre) proyectosTorre = valores.porFrenteTorre.get(`${frente}||${torre}`) || [];
      else if (frente) proyectosTorre = valores.porFrente.get(frente) || [];
      else if (etapa) proyectosTorre = valores.porEtapa.get(etapa) || [];
      // Lista vacía -> `IN ()` deja el listado sin filas, que es lo correcto: el
      // usuario pidió una rama de la cascada que no tiene inmuebles.
      where.referencia_recaudo = { [Op.in]: await referenciasPorProyectoTorre(proyectosTorre) };
    }
  }

  if (search) {
    const like = `%${String(search).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where[Op.or] = [
      { deal_name: { [Op.iLike]: like } },
      { referencia_recaudo: { [Op.iLike]: like } },
      { contact_name: { [Op.iLike]: like } },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  // Orden server-side ANTES de la paginación (mismo motivo/patrón que
  // `otrosi.service.js`: ordenar en el navegador solo reordenaría la página
  // actual). Sin `sortBy`, se mantiene el orden por defecto de siempre
  // (`pago_separacion DESC`).
  const order = sortBy === 'inmueble'
    ? [ordenLiteralInmueble('Oportunidad', sortDir), ['id', 'ASC']]
    : ordenSequelize({ sortBy, sortDir, campos: CAMPOS_ORDEN, porDefecto: [['pago_separacion', 'DESC'], ['id', 'ASC']] });

  const { rows, count } = await Oportunidad.findAndCountAll({
    where,
    offset: (pageNum - 1) * limitNum,
    limit: limitNum,
    order,
  });

  const inmueblesPorRef = await inmueblesPorReferencia(rows.map((r) => r.referencia_recaudo));
  const refsConVigente = await referenciasConOportunidadVigente(rows.map((r) => r.referencia_recaudo));

  return {
    data: rows.map((row) => _mapItem(row, mapInmueble(inmuebleDeFila(row, inmueblesPorRef, refsConVigente)))),
    pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) },
    // Cascada de filtros del inmueble (mismo shape que Otrosíes/Negocios),
    // para que el frontend no los escriba a mano.
    etapasDisponibles: [...valores.porEtapa.keys(), SIN_PROYECTO].sort(compararEtapas),
    frentesDisponibles: [...valores.porFrente.keys()].filter(esFrenteSeleccionable).sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

async function listStages() {
  const rows = await sequelize.query('SELECT DISTINCT stage FROM oportunidades WHERE stage IS NOT NULL ORDER BY stage ASC', { type: QueryTypes.SELECT });
  return rows.map((r) => r.stage);
}

async function getById(id) {
  const item = await Oportunidad.findByPk(id);
  if (!item) throw new ApiError(404, 'Oportunidad no encontrada');
  return _mapDetalle(item);
}

// Forma de Pago / Propuesta de Pago -- primero desde BD; si no hay (el sync
// masivo nunca los trae y el backfill todavía no llegó a esta), fallback a
// Zoho y se cachean para la próxima vez.
async function getSubforms(id) {
  const opp = await Oportunidad.findByPk(id, { attributes: ['id', 'zoho_id', 'forma_pago', 'propuesta_pago'] });
  if (!opp) throw new ApiError(404, 'Oportunidad no encontrada');

  if (opp.forma_pago || opp.propuesta_pago) {
    return { formaPago: opp.forma_pago || [], propuestaPago: opp.propuesta_pago || [] };
  }

  const token = await getAccessToken();
  const response = await axios.get(`${zohoConfig.apiBase}/Deals/${opp.zoho_id}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    params: { fields: 'Forma_de_Pago,Propuesta_de_Pago' },
  });

  const deal = response.data?.data?.[0] || {};
  const SKIP = ['$in_merge', '$field_states', '$layout_id', '$permissions', 'Parent_Id', 'Created_Time', 'Modified_Time'];
  const clean = (arr) => (arr || []).map((row) => Object.fromEntries(Object.entries(row).filter(([k, v]) => !SKIP.includes(k) && v != null && v !== '')));

  const formaPago = clean(deal.Forma_de_Pago);
  const propuestaPago = clean(deal.Propuesta_de_Pago);

  await opp.update({ forma_pago: formaPago.length ? formaPago : null, propuesta_pago: propuestaPago.length ? propuestaPago : null });

  return { formaPago, propuestaPago };
}

// Botón "Actualizar desde Zoho" del plan de pagos: vuelve a traer los subforms de esta oportunidad y reemplaza lo guardado.
async function refrescarSubforms(id) {
  const opp = await Oportunidad.findByPk(id);
  if (!opp) throw new ApiError(404, 'Oportunidad no encontrada');
  const { refrescarSubformsDe } = require('./oportunidad.subformsBackfill');
  let resultado;
  try {
    resultado = await refrescarSubformsDe(opp);
  } catch (err) {
    throw new ApiError(502, `No se pudo consultar Zoho: ${err.response?.data?.message || err.message}`);
  }
  require('../dashboard/dashboardCache').invalidarCacheDashboard();
  return resultado;
}

// Metadatos de campos de Zoho (api_name -> field_label) -- el legado los
// exponía en /api/fields/metadata para que el frontend tradujera nombres
// crudos de API (seccionInmueble/seccionCotizacion/camposFinancieros) a
// etiquetas en español, sin hardcodear el mapeo en el cliente.
async function listCamposMetadata() {
  const rows = await ZohoFieldMetadata.findAll({ order: [['field_label', 'ASC']] });
  return rows.map((r) => ({ apiName: r.api_name, fieldLabel: r.field_label, dataType: r.data_type, sectionName: r.section_name }));
}

// Vista de SOLO LECTURA 'Otrosíes' -- fue reubicada en su módulo propio
// (`modules/otrosi/`, tabla `baia_kristal_otrosies`) porque Otrosíes debe
// cubrir TODOS los Deals de Baía Kristal y `oportunidades` solo sincroniza
// los que tienen `pago_separacion`. El endpoint `GET /otrosies` ahora lo
// atiende `otrosi.service.js`; acá ya no vive.
module.exports = { list, listStages, getById, getSubforms, refrescarSubforms, listCamposMetadata, _mapItem };
