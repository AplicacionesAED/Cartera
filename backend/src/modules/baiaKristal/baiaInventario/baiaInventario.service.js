// Adaptado de la lógica que en el proyecto legado vivía directo en
// routes/inventario.js -- acá sí separada en service (patrón de 5 archivos,
// ver ARQUITECTURA-BACKEND.md). Los filtros por Proyecto_Torre (JSONB) se
// resuelven con SQL crudo vía Sequelize (`sequelize.query` con
// `replacements`), igual criterio que ya usa inventarioTorres.service.js --
// más simple y predecible que pelear con los helpers de JSON path del ORM.
const { QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const ApiError = require('../../../utils/ApiError');
const { lista } = require('../../../utils/filtros');
const { PRIORIDAD_ESTADO_SQL } = require('../baiaVinculo/baiaVinculoResolver');
const { PROYECTO_TORRE_EXCLUIDOS, proyectosTorreDeFiltros, valoresProyectoTorre, compararEtapas, esFrenteSeleccionable } = require('./baiaInventarioTorres.service');

// ESTADO FIDUCIA: el estado del negocio vinculado al inmueble (tabla vinculos_negocio_inmueble; si hay varios negocios,
// el vigente, ver PRIORIDAD_ESTADO_SQL). Un inmueble VIP del CRM se queda en VIP; el que no tiene negocio vinculado
// queda LIBRE y se marca `libreSinVinculo` (alerta en la UI).
const FROM_CON_FIDUCIA = `FROM inventario_items
  LEFT JOIN LATERAL (
    SELECT n.estado AS nf_estado FROM vinculos_negocio_inmueble v JOIN negocios n ON n.referencia = v.referencia
    WHERE v.inventario_id = inventario_items.id ORDER BY ${PRIORIDAD_ESTADO_SQL}, n.id ASC LIMIT 1
  ) nf ON true`;
const ESTADO_FIDUCIA_SQL = `(CASE WHEN inventario_items.estado = 'VIP' THEN 'VIP' WHEN nf.nf_estado IS NOT NULL THEN nf.nf_estado ELSE 'LIBRE' END)`;
const LIBRE_SIN_VINCULO_SQL = `(inventario_items.estado IS DISTINCT FROM 'VIP' AND nf.nf_estado IS NULL)`;

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
    estadoFiducia: row.estado_fiducia ?? null,
    libreSinVinculo: row.libre_sin_vinculo ?? false,
    referenciaRecaudo: row.referencia_recaudo,
    datos: row.datos,
    ultimoSyncEn: row.ultimo_sync_en,
  };
}

async function list({ search, proyecto, categoria, estado, estadoFiducia, etapa, frente, torre, page = 1, limit = 50 }) {
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
  const estadosFiducia = lista(estadoFiducia);
  if (estadosFiducia.length) {
    conditions.push(`${ESTADO_FIDUCIA_SQL} IN (:estadoFiduciaLista)`);
    replacements.estadoFiduciaLista = estadosFiducia;
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
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  const [totalRows, items, proyectos, categorias, estados, estadosFiduciaRows] = await Promise.all([
    sequelize.query(`SELECT COUNT(*)::int AS total ${FROM_CON_FIDUCIA} ${whereSql}`, { type: QueryTypes.SELECT, replacements }),
    sequelize.query(
      `SELECT inventario_items.*, ${ESTADO_FIDUCIA_SQL} AS estado_fiducia, ${LIBRE_SIN_VINCULO_SQL} AS libre_sin_vinculo ${FROM_CON_FIDUCIA} ${whereSql} ORDER BY proyecto ASC NULLS LAST, nombre ASC NULLS LAST LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements: { ...replacements, limit: limitNum, offset: (pageNum - 1) * limitNum } }
    ),
    sequelize.query(`SELECT DISTINCT proyecto FROM inventario_items WHERE proyecto IS NOT NULL ORDER BY proyecto ASC`, { type: QueryTypes.SELECT }),
    sequelize.query(`SELECT DISTINCT categoria FROM inventario_items WHERE categoria IS NOT NULL ORDER BY categoria ASC`, { type: QueryTypes.SELECT }),
    sequelize.query(`SELECT DISTINCT estado FROM inventario_items WHERE estado IS NOT NULL ORDER BY estado ASC`, { type: QueryTypes.SELECT }),
    sequelize.query(`SELECT DISTINCT ${ESTADO_FIDUCIA_SQL} AS estado_fiducia ${FROM_CON_FIDUCIA} WHERE (nombre IS NULL OR nombre NOT LIKE '*%') ORDER BY 1`, { type: QueryTypes.SELECT }),
  ]);

  const total = totalRows[0]?.total ?? 0;

  return {
    data: items.map(_mapItem),
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    proyectos: proyectos ? proyectos.map((p) => p.proyecto) : undefined,
    categorias: categorias ? categorias.map((c) => c.categoria) : undefined,
    estados: estados ? estados.map((e) => e.estado) : undefined,
    estadosFiducia: estadosFiduciaRows ? estadosFiduciaRows.map((e) => e.estado_fiducia) : undefined,
    etapasDisponibles: [...valores.porEtapa.keys()].sort(compararEtapas),
    frentesDisponibles: [...valores.porFrente.keys()].filter(esFrenteSeleccionable).sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

async function getById(id) {
  if (!/^\d+$/.test(String(id))) throw new ApiError(404, 'Ítem de inventario no encontrado');
  const rows = await sequelize.query(
    `SELECT inventario_items.*, ${ESTADO_FIDUCIA_SQL} AS estado_fiducia, ${LIBRE_SIN_VINCULO_SQL} AS libre_sin_vinculo ${FROM_CON_FIDUCIA} WHERE inventario_items.id = :id`,
    { type: QueryTypes.SELECT, replacements: { id } }
  );
  if (!rows[0]) throw new ApiError(404, 'Ítem de inventario no encontrado');
  return _mapItem(rows[0]);
}

module.exports = { list, getById };
