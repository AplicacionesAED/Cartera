// Adaptado de la lógica que en el proyecto legado vivía directo en
// routes/inventario.js -- acá sí separada en service (patrón de 5 archivos,
// ver ARQUITECTURA-BACKEND.md). Los filtros por Proyecto_Torre (JSONB) se
// resuelven con SQL crudo vía Sequelize (`sequelize.query` con
// `replacements`), igual criterio que ya usa inventarioTorres.service.js --
// más simple y predecible que pelear con los helpers de JSON path del ORM.
const { QueryTypes } = require('sequelize');
const sequelize = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const InventarioItem = require('./inventarioItem.model');
const { lista } = require('../../utils/filtros');
const { PROYECTO_TORRE_EXCLUIDOS, proyectosTorreDeFiltros, valoresProyectoTorre, compararEtapas, esFrenteSeleccionable } = require('./inventarioTorres.service');

function _mapItem(row) {
  return {
    id: row.id,
    zohoId: row.zoho_id,
    nombre: row.nombre,
    proyecto: row.proyecto,
    torre: row.torre,
    piso: row.piso,
    categoria: row.categoria,
    estado: row.estado,
    referenciaRecaudo: row.referencia_recaudo,
    datos: row.datos,
    ultimoSyncEn: row.ultimo_sync_en,
  };
}

async function list({ search, proyecto, categoria, estado, etapa, frente, torre, page = 1, limit = 50 }) {
  const valores = await valoresProyectoTorre();

  const conditions = [`(nombre IS NULL OR nombre NOT LIKE '*%')`];
  const replacements = {};
  if (PROYECTO_TORRE_EXCLUIDOS.size > 0) {
    conditions.push(`(datos->>'Proyecto_Torre' IS NULL OR datos->>'Proyecto_Torre' NOT IN (:excluidos))`);
    replacements.excluidos = [...PROYECTO_TORRE_EXCLUIDOS];
  }
  for (const [campo, valor] of [['proyecto', proyecto], ['categoria', categoria], ['estado', estado]]) {
    const vals = lista(valor);
    if (vals.length) {
      conditions.push(`${campo} IN (:${campo}Lista)`);
      replacements[`${campo}Lista`] = vals;
    }
  }
  const proy = proyectosTorreDeFiltros(valores, { etapas: lista(etapa), frentes: lista(frente), torres: lista(torre) });
  if (proy) {
    if (proy.lista.length > 0) {
      conditions.push(`datos->>'Proyecto_Torre' IN (:proyTorreLista)`);
      replacements.proyTorreLista = proy.lista;
    } else {
      conditions.push('1 = 0');
    }
  }
  if (search) {
    conditions.push(`(nombre ILIKE :search OR torre ILIKE :search OR referencia_recaudo ILIKE :search)`);
    replacements.search = `%${search}%`;
  }

  const whereSql = `WHERE ${conditions.join(' AND ')}`;
  const noFilters = !search && ![proyecto, categoria, estado, etapa, frente, torre].some((v) => lista(v).length);
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  const [totalRows, items, proyectos, categorias, estados] = await Promise.all([
    sequelize.query(`SELECT COUNT(*)::int AS total FROM inventario_items ${whereSql}`, { type: QueryTypes.SELECT, replacements }),
    sequelize.query(
      `SELECT * FROM inventario_items ${whereSql} ORDER BY proyecto ASC NULLS LAST, nombre ASC NULLS LAST LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements: { ...replacements, limit: limitNum, offset: (pageNum - 1) * limitNum } }
    ),
    noFilters
      ? sequelize.query(`SELECT DISTINCT proyecto FROM inventario_items WHERE proyecto IS NOT NULL ORDER BY proyecto ASC`, { type: QueryTypes.SELECT })
      : Promise.resolve(null),
    noFilters
      ? sequelize.query(`SELECT DISTINCT categoria FROM inventario_items WHERE categoria IS NOT NULL ORDER BY categoria ASC`, { type: QueryTypes.SELECT })
      : Promise.resolve(null),
    noFilters
      ? sequelize.query(`SELECT DISTINCT estado FROM inventario_items WHERE estado IS NOT NULL ORDER BY estado ASC`, { type: QueryTypes.SELECT })
      : Promise.resolve(null),
  ]);

  const total = totalRows[0]?.total ?? 0;

  return {
    data: items.map(_mapItem),
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    proyectos: proyectos ? proyectos.map((p) => p.proyecto) : undefined,
    categorias: categorias ? categorias.map((c) => c.categoria) : undefined,
    estados: estados ? estados.map((e) => e.estado) : undefined,
    etapasDisponibles: [...valores.porEtapa.keys()].sort(compararEtapas),
    frentesDisponibles: [...valores.porFrente.keys()].filter(esFrenteSeleccionable).sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

async function getById(id) {
  const item = await InventarioItem.findByPk(id);
  if (!item) throw new ApiError(404, 'Ítem de inventario no encontrado');
  return _mapItem(item.toJSON());
}

module.exports = { list, getById };
