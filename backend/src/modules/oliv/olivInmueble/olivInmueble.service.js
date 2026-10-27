// Mismo patrón que inventario.servicio.js (Baía Kristal/Zoho), pero sin
// jerarquía Etapa→Frente→Torre: el objeto "Unidades" de HubSpot ya trae
// `torre` como propiedad plana (no una expresión JSONB compuesta como
// `Proyecto_Torre` en Zoho), así que los filtros son directos.
const { lista } = require('../../../utils/filtros');
const { Op } = require('sequelize');
const ApiError = require('../../../utils/ApiError');
const OlivInmueble = require('./olivInmueble.model');

function _mapItem(row) {
  return {
    id: row.id,
    hubspotId: row.hubspot_id,
    codigoUnidad: row.codigo_unidad,
    idUnidad: row.id_unidad,
    proyecto: row.proyecto,
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
    ultimoSyncEn: row.ultimo_sync_en,
  };
}

function _mapDetalle(row) {
  return { ..._mapItem(row), propiedades: row.propiedades };
}

async function list({ search, torre, categoria, estado, page = 1, limit = 50 }) {
  const where = {};
  if (lista(torre).length) where.torre = { [Op.in]: lista(torre) };
  if (lista(categoria).length) where.categoria = { [Op.in]: lista(categoria) };
  if (lista(estado).length) where.estado = { [Op.in]: lista(estado) };
  if (search) {
    const like = `%${String(search).replace(/[\\%_]/g, (o) => `\\${o}`)}%`;
    where[Op.or] = [{ codigo_unidad: { [Op.iLike]: like } }, { torre: { [Op.iLike]: like } }];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  const noFiltros = !search && !lista(torre).length && !lista(categoria).length && !lista(estado).length;

  const [{ rows, count }, torres, categorias, estados] = await Promise.all([
    OlivInmueble.findAndCountAll({
      where,
      offset: (pageNum - 1) * limitNum,
      limit: limitNum,
      order: [['torre', 'ASC'], ['piso', 'ASC'], ['codigo_unidad', 'ASC']],
    }),
    noFiltros ? OlivInmueble.findAll({ attributes: ['torre'], group: 'torre', where: { torre: { [Op.ne]: null } }, raw: true }) : null,
    noFiltros ? OlivInmueble.findAll({ attributes: ['categoria'], group: 'categoria', where: { categoria: { [Op.ne]: null } }, raw: true }) : null,
    noFiltros ? OlivInmueble.findAll({ attributes: ['estado'], group: 'estado', where: { estado: { [Op.ne]: null } }, raw: true }) : null,
  ]);

  return {
    data: rows.map(_mapItem),
    pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) },
    torres: torres ? torres.map((t) => t.torre).sort() : undefined,
    categorias: categorias ? categorias.map((o) => o.categoria).sort() : undefined,
    estados: estados ? estados.map((e) => e.estado).sort() : undefined,
  };
}

async function getById(id) {
  const item = await OlivInmueble.findByPk(id);
  if (!item) throw new ApiError(404, 'Inmueble no encontrado');
  return _mapDetalle(item);
}

module.exports = { list, getById };
