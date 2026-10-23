const { Op } = require('sequelize');
const { lista } = require('../../utils/filtros');
const { ordenSequelize } = require('../../utils/ordenamiento');
const ApiError = require('../../utils/ApiError');
const { tokenConfigurado } = require('../../utils/hubspotClient');
const centroAplicacionesDb = require('../../utils/centroAplicacionesDb');
const { limpiarNombreContacto, ETAPA_MINIMA_ORDER } = require('../../utils/olivHelpers');
const olivOportunidad = require('./olivOportunidad.model');
const OlivPropiedadMetadata = require('./olivPropiedadMetadata.model');
const OlivInmueble = require('../olivInmueble/olivInmueble.model');

// Whitelist de orden server-side (Jefe Gabriel, 2026-09-25), mismo patrón
// que oportunidad.service.js (Baía Kristal). 'inmueble' no está acá --
// ordena por columnas de la asociación `inmueble`, resuelto aparte en
// `list()` (a diferencia de Baía Kristal, acá SÍ hay una FK real, así que es
// un `order` de Sequelize normal sobre el include, no una subquery).
const CAMPOS_ORDEN = {
  id: 'id',
  dealName: 'deal_name',
  nombreContacto: 'nombre_contacto',
  stage: 'stage',
  referenciaRecaudo: 'referencia_recaudo',
};

function _mapInmueble(row) {
  if (!row) return null;
  // `codigo_unidad` de HubSpot YA incluye la torre (ej. "SEIVA - 103") --
  // a diferencia de Baía Kristal, acá no hay que componer un label a mano
  // con Frente/Torre/Nomenclatura por separado, se duplicaría ("SEIVA -
  // SEIVA - 103").
  return {
    codigoUnidad: row.codigo_unidad,
    torre: row.torre,
    piso: row.piso,
    categoria: row.categoria,
    tipoApartamento: row.tipo_apartamento,
    estado: row.estado,
    label: row.codigo_unidad || row.torre || null,
  };
}

function _mapItem(row) {
  return {
    id: row.id,
    hubspotId: row.hubspot_id,
    dealName: row.deal_name,
    nombreContacto: limpiarNombreContacto(row.nombre_contacto, row.proyecto),
    email: row.email,
    telefono: row.telefono,
    proyecto: row.proyecto,
    stage: row.stage,
    referenciaRecaudo: row.referencia_recaudo,
    // Columna 'Inmueble' (Jefe Gabriel, 2026-09-25) -- viene del `include`
    // de la asociación real `inmueble_hubspot_id -> OlivInmueble.hubspot_id`
    // (ver olivOportunidad.model.js), `null` si el Deal no tiene unidad
    // vinculada en HubSpot todavía.
    inmueble: _mapInmueble(row.inmueble),
    amount: row.amount,
    closeDate: row.close_date,
    ultimoSyncEn: row.ultimo_sync_en,
  };
}

async function _mapDetalle(row) {
  const cotizacion = await centroAplicacionesDb.getCotizacionAceptada(row.hubspot_id).catch(() => null);
  return { ..._mapItem(row), propiedades: row.propiedades, cotizacionAceptada: centroAplicacionesDb.mapCotizacion(cotizacion) };
}

// El propio sync ya filtra del lado de HubSpot a "etapa 8 y superiores"
// (ETAPA_MINIMA_ORDER, ver olivHelpers.js)
// (ver fetchAllDealsOliv en olivOportunidad.sync.js -- pedido explícito del
// usuario: "no es la idea, la idea es que solo traigas las que cumplen con
// los requisitos"), así que en teoría todo lo que hay en `oliv_oportunidades`
// ya calificaba. Este filtro se deja igual como resguardo de lectura (defensa
// en profundidad, ej. si algún día se relaja el filtro del sync).
// Buscar "por inmueble" no tiene columna propia en oliv_oportunidades (solo
// `inmueble_hubspot_id`, un id de HubSpot) -- se resuelve primero contra
// OlivInmueble (código de unidad/torre) y esos hubspot_id que matchean se
// suman al OR de abajo. Pedido explícito del usuario (2026-09-14): "que se
// pueda filtrar por Ref Recaudo, tanto como por inmueble como por nombre
// del propietario" -- mismo criterio de búsqueda que ya tiene negocios.
async function _hubspotIdsPorInmueble(search) {
  const rows = await OlivInmueble.findAll({
    where: { [Op.or]: [{ codigo_unidad: { [Op.iLike]: `%${search}%` } }, { torre: { [Op.iLike]: `%${search}%` } }] },
    attributes: ['hubspot_id'],
    raw: true,
  });
  return rows.map((r) => r.hubspot_id);
}

// Torre/Estado del inmueble disponibles para los Select de filtro (Jefe
// Gabriel, 2026-09-25) -- mismo criterio plano que `olivInmueble.service.js#list()`
// y `olivNegocio.service.js#list()` (Oliv es un solo proyecto, sin jerarquía
// Etapa->Frente->Torre como Baía Kristal, así que no hace falta cascada).
async function _torresYEstadosDisponibles() {
  const [torres, estados] = await Promise.all([
    OlivInmueble.findAll({ attributes: ['torre'], group: 'torre', where: { torre: { [Op.ne]: null } }, raw: true }),
    OlivInmueble.findAll({ attributes: ['estado'], group: 'estado', where: { estado: { [Op.ne]: null } }, raw: true }),
  ]);
  return { torresDisponibles: torres.map((t) => t.torre).sort(), estadosInmuebleDisponibles: estados.map((e) => e.estado).sort() };
}

async function list({ search, stage, torre, estadoInmueble, sortBy, sortDir, page = 1, limit = 20 }) {
  const where = { stage_order: { [Op.gte]: ETAPA_MINIMA_ORDER } };
  if (lista(stage).length) where.stage = { [Op.in]: lista(stage) };
  if (search) {
    const hubspotIdsInmueble = await _hubspotIdsPorInmueble(search);
    const like = `%${String(search).replace(/[\\%_]/g, (o) => `\\${o}`)}%`;
    where[Op.or] = [
      { deal_name: { [Op.iLike]: like } },
      { nombre_contacto: { [Op.iLike]: like } },
      { referencia_recaudo: { [Op.iLike]: like } },
      ...(hubspotIdsInmueble.length > 0 ? [{ inmueble_hubspot_id: { [Op.in]: hubspotIdsInmueble } }] : []),
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  // `required: true` (INNER JOIN) SOLO si se está filtrando por Torre/Estado
  // del inmueble -- sin filtro, sigue siendo LEFT JOIN (un Deal sin unidad
  // vinculada en HubSpot todavía debe seguir apareciendo, con `inmueble: null`).
  const filtraPorInmueble = Boolean(lista(torre).length || lista(estadoInmueble).length);
  const inmuebleWhere = {};
  if (lista(torre).length) inmuebleWhere.torre = { [Op.in]: lista(torre) };
  if (lista(estadoInmueble).length) inmuebleWhere.estado = { [Op.in]: lista(estadoInmueble) };

  // 'inmueble' ordena por las columnas reales de la asociación (Torre, luego
  // Unidad) -- a diferencia de Baía Kristal, acá el cruce es una FK real
  // (`olivOportunidad.model.js`), así que es un `order` de Sequelize normal
  // sobre el include, sin subquery.
  const order = sortBy === 'inmueble'
    ? [
        [{ model: OlivInmueble, as: 'inmueble' }, 'torre', String(sortDir || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC'],
        [{ model: OlivInmueble, as: 'inmueble' }, 'codigo_unidad', String(sortDir || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC'],
        ['id', 'ASC'],
      ]
    : ordenSequelize({ sortBy, sortDir, campos: CAMPOS_ORDEN, porDefecto: [['actualizado_en', 'DESC'], ['id', 'ASC']] });

  const [{ rows, count }, disponibles] = await Promise.all([
    olivOportunidad.findAndCountAll({
      where,
      include: [{ model: OlivInmueble, as: 'inmueble', where: filtraPorInmueble ? inmuebleWhere : undefined, required: filtraPorInmueble }],
      offset: (pageNum - 1) * limitNum,
      limit: limitNum,
      order,
      subQuery: false,
    }),
    _torresYEstadosDisponibles(),
  ]);

  return {
    data: rows.map(_mapItem),
    pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) },
    ...disponibles,
  };
}

// Valores distintos de `stage` para el Select "Etapa CRM" -- mismo criterio
// que listStages() de Oportunidades/Otrosíes (Baía Kristal): limitado al
// MISMO universo que ve el listado (stage_order >= ETAPA_MINIMA_ORDER), para
// no ofrecer una opción que siempre daría 0 resultados.
async function listStages() {
  const rows = await olivOportunidad.findAll({
    attributes: ['stage'],
    where: { stage: { [Op.ne]: null }, stage_order: { [Op.gte]: ETAPA_MINIMA_ORDER } },
    group: ['stage'],
    order: [['stage', 'ASC']],
    raw: true,
  });
  return rows.map((r) => r.stage).filter(Boolean);
}

async function getById(id) {
  const item = await olivOportunidad.findByPk(id);
  if (!item) throw new ApiError(404, 'Oportunidad no encontrada');
  return _mapDetalle(item);
}

// Metadatos de propiedades de HubSpot -- equivalente a
// oportunidad.servicio.js#listCamposMetadata, para traducir claves crudas de
// `propiedades` a etiquetas legibles en el frontend.
async function listPropiedadesMetadata() {
  const rows = await OlivPropiedadMetadata.findAll({ order: [['label', 'ASC']] });
  return rows.map((r) => ({ name: r.name, label: r.label, tipo: r.tipo, grupo: r.grupo }));
}

async function status() {
  return { modulo: 'oliv-oportunidades', hubspotConfigurado: tokenConfigurado() };
}

module.exports = { list, getById, listStages, listPropiedadesMetadata, status };
