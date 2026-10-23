// Adaptado de la lógica que en el proyecto legado vivía directo en
// routes/fiducia.js. Los endpoints que cruzan con Negocio
// (encargos/:id/nomenclaturas, encargos/:id/negocio/:referencia) se habían
// diferido a la fase de Negocios (ver fiducia.upload.js) -- ese módulo ya
// existe, así que se agregan acá (mismo criterio que negocio.service.js
// importando el modelo Oportunidad de otro módulo: la ruta vive en el
// namespace de Fiducia, pero cruza datos de Negocio).
const { lista } = require('../../utils/filtros');
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const EncargFiduciario = require('./encargFiduciario.model');
const HojaFiduciaria = require('./hojaFiduciaria.model');
const MovimientoFiduciario = require('./movimientoFiduciario.model');
const Negocio = require('../negocio/negocio.model');
const NegocioComprador = require('../negocio/negocioComprador.model');
const NegocioMovimiento = require('../negocio/negocioMovimiento.model');

async function listEncargos({ search, proyecto, page = 1, limit = 20 }) {
  const where = {};
  if (search) {
    const like = `%${String(search).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where[Op.or] = [
      { nombre: { [Op.iLike]: like } },
      { codigo: { [Op.iLike]: like } },
      { archivo_nombre: { [Op.iLike]: like } },
    ];
  }
  const proyectos = lista(proyecto);
  if (proyectos.length) where.codigo = { [Op.iLike]: { [Op.any]: proyectos.map((p) => `%${p}%`) } };

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const { rows, count } = await EncargFiduciario.findAndCountAll({
    where,
    offset: (pageNum - 1) * limitNum,
    limit: limitNum,
    order: [['creado_en', 'DESC']],
    include: [{ model: HojaFiduciaria, as: 'hojas', attributes: ['id', 'nombre_hoja', 'total_filas'], separate: true, order: [['nombre_hoja', 'ASC']] }],
  });

  const codigosRaw = await EncargFiduciario.findAll({ attributes: ['codigo'], where: { codigo: { [Op.ne]: null } }, group: ['codigo'], order: [['codigo', 'ASC']] });

  return {
    data: rows,
    pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) },
    codigos: codigosRaw.map((c) => c.codigo).filter(Boolean),
  };
}

async function getEncargo(id) {
  const encargo = await EncargFiduciario.findByPk(id, {
    include: [{ model: HojaFiduciaria, as: 'hojas', attributes: ['id', 'nombre_hoja', 'total_filas'], separate: true, order: [['nombre_hoja', 'ASC']] }],
  });
  if (!encargo) throw new ApiError(404, 'Encargo no encontrado');
  return encargo;
}

async function getHoja(encargoId, hojaId, { page = 1, limit = 200 }) {
  const hoja = await HojaFiduciaria.findOne({ where: { id: hojaId, encarg_id: encargoId } });
  if (!hoja) throw new ApiError(404, 'Hoja no encontrada');

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(500, Math.max(1, Number(limit) || 200));
  const allFilas = Array.isArray(hoja.filas) ? hoja.filas : [];
  const start = (pageNum - 1) * limitNum;

  return {
    id: hoja.id,
    nombreHoja: hoja.nombre_hoja,
    columnas: hoja.columnas,
    filas: allFilas.slice(start, start + limitNum),
    pagination: { total: hoja.total_filas, page: pageNum, limit: limitNum, totalPages: Math.ceil(hoja.total_filas / limitNum) },
  };
}

async function updateEncargo(id, { nombre, codigo }) {
  const encargo = await EncargFiduciario.findByPk(id);
  if (!encargo) throw new ApiError(404, 'Encargo no encontrado');
  const values = {};
  if (nombre !== undefined) values.nombre = nombre;
  if (codigo !== undefined) values.codigo = codigo;
  if (Object.keys(values).length === 0) throw new ApiError(400, 'Nada que actualizar');
  await encargo.update(values);
  return encargo;
}

async function removeEncargo(id) {
  const encargo = await EncargFiduciario.findByPk(id);
  if (!encargo) throw new ApiError(404, 'Encargo no encontrado');
  await encargo.destroy();
}

const ALLOWED_SORT = { propietario: 'propietario', hoja: 'nombre_hoja', createdAt: 'creado_en', fechaContable: 'fecha_contable', valor: 'valor', tipo: 'tipo_movimiento' };

// Columnas de texto donde busca `search` en las líneas de movimiento (forma A). Antes la búsqueda recorría
// `datos::text` completo (incluidos los NOMBRES de las claves, así que buscar "valor" devolvía todo); ahora
// busca solo en los VALORES. Las filas que no son forma A (estado por unidad, formas desconocidas) siguen
// buscándose en su `datos` jsonb, que es donde viven.
const COLUMNAS_BUSQUEDA_TEXTO = ['propietario', 'tipo_movimiento', 'estado', 'propietario_1', 'nro_id_propietario_1', 'cuenta_bancaria',
  'comentarios', 'razones_justificaciones', 'observaciones', 'inventario', 'nomenclatura', 'referencia', 'fideicomiso', 'tipo_inmueble', 'categoria'];
const COLUMNAS_BUSQUEDA_NUMERICAS = ['concepto', 'id_interno', 'valor', 'area'];

// Filtro por fecha sobre la columna `fecha_contable` (date; antes se leía del JSON 'Fecha Contable' esperando
// DD/MM/YYYY, pero los datos reales son seriales de Excel y ese filtro nunca devolvía filas). Bind parameters
// posicionales ($1, $2...), no `replacements` con nombre -- ver la regla en
// CLAUDE.md (bug real encontrado migrando Oportunidades).
async function listMovimientosPorFecha({ encargId, hoja, propietario, search, fechaDesde, fechaHasta, limit, skip }) {
  const conds = [];
  const params = [];
  let idx = 1;

  if (encargId) {
    conds.push(`m.encarg_id = $${idx++}::integer`);
    params.push(encargId);
  }
  if (hoja) {
    conds.push(`m.nombre_hoja = $${idx++}`);
    params.push(hoja);
  }
  if (propietario) {
    conds.push(`m.propietario ILIKE $${idx++}`);
    params.push(`%${propietario}%`);
  }
  if (search) {
    const textos = COLUMNAS_BUSQUEDA_TEXTO.map((c) => `m.${c} ILIKE $${idx}`);
    const numericas = COLUMNAS_BUSQUEDA_NUMERICAS.map((c) => `m.${c}::text ILIKE $${idx}`);
    conds.push(`(${[...textos, ...numericas].join(' OR ')} OR (m.forma IS DISTINCT FROM 'A' AND m.datos::text ILIKE $${idx}))`);
    params.push(`%${search}%`);
    idx += 1;
  }
  if (fechaDesde) {
    conds.push(`m.fecha_contable >= $${idx++}::date`);
    params.push(fechaDesde);
  }
  if (fechaHasta) {
    conds.push(`m.fecha_contable <= $${idx++}::date`);
    params.push(fechaHasta);
  }

  const whereSQL = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const limitIdx = idx++;
  const skipIdx = idx++;

  const [countRows, rows] = await Promise.all([
    sequelize.query(`SELECT COUNT(*)::int AS count FROM movimientos_fiduciarios m ${whereSQL}`, { bind: params, type: QueryTypes.SELECT }),
    sequelize.query(
      `SELECT m.id, m.encarg_id, m.hoja_id, m.nombre_hoja, m.propietario, mf_datos(m) AS datos, m.creado_en,
              e.nombre AS encargo_nombre, e.codigo AS encargo_codigo, e.archivo_nombre AS encargo_archivo
       FROM movimientos_fiduciarios m
       LEFT JOIN encargos_fiduciarios e ON m.encarg_id = e.id
       ${whereSQL}
       ORDER BY m.propietario ASC, m.creado_en ASC
       LIMIT $${limitIdx} OFFSET $${skipIdx}`,
      { bind: [...params, limit, skip], type: QueryTypes.SELECT }
    ),
  ]);

  return {
    total: countRows[0]?.count ?? 0,
    records: rows.map((r) => ({
      id: r.id,
      encargId: r.encarg_id,
      hojaId: r.hoja_id,
      nombreHoja: r.nombre_hoja,
      propietario: r.propietario,
      datos: r.datos,
      createdAt: r.creado_en,
      encargo: { nombre: r.encargo_nombre, codigo: r.encargo_codigo, archivoNombre: r.encargo_archivo },
    })),
  };
}

async function listMovimientos({ encargId: rawEncargId, codigo, propietario, hoja, search, page = 1, limit = 50, fechaDesde, fechaHasta, sortField, sortDir }) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (pageNum - 1) * limitNum;

  let encargId = rawEncargId;
  if (!encargId && codigo) {
    const enc = await EncargFiduciario.findOne({ where: { codigo: { [Op.iLike]: `%${codigo}%` } }, attributes: ['id'] });
    if (enc) encargId = enc.id;
  }

  let total, records;

  if (fechaDesde || fechaHasta) {
    ({ total, records } = await listMovimientosPorFecha({ encargId, hoja, propietario, search, fechaDesde, fechaHasta, limit: limitNum, skip }));
  } else {
    // Orden whitelist de los movimientos: `sortField` histórico + `sortBy`
    // como alias (este fix de orden se conserva; es independiente de la
    // búsqueda tolerante, que se revirtió el 2026-09-24).
    const resolvedSort = ALLOWED_SORT[sortField] || 'propietario';
    const resolvedDir = sortDir === 'desc' ? 'DESC' : 'ASC';

    const where = {};
    if (encargId) where.encarg_id = encargId;
    if (hoja) where.nombre_hoja = hoja;
    if (propietario) where.propietario = { [Op.iLike]: `%${propietario}%` };
    if (search) {
      const like = `%${String(search).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where[Op.or] = [
        ...COLUMNAS_BUSQUEDA_TEXTO.map((c) => ({ [c]: { [Op.iLike]: like } })),
        ...COLUMNAS_BUSQUEDA_NUMERICAS.map((c) => sequelize.where(sequelize.cast(sequelize.col(`MovimientoFiduciario.${c}`), 'text'), { [Op.iLike]: like })),
        { [Op.and]: [{ [Op.or]: [{ forma: null }, { forma: { [Op.ne]: 'A' } }] }, sequelize.where(sequelize.cast(sequelize.col('MovimientoFiduciario.datos'), 'text'), { [Op.iLike]: like })] },
      ];
    }

    const { rows, count } = await MovimientoFiduciario.findAndCountAll({
      where,
      // `datos` se reconstruye desde las columnas normalizadas (mismo objeto que antes).
      attributes: ['id', 'encarg_id', 'hoja_id', 'nombre_hoja', 'propietario', 'creado_en', [sequelize.literal('mf_datos("MovimientoFiduciario")'), 'datos']],
      offset: skip,
      limit: limitNum,
      order: [[resolvedSort, resolvedDir]],
      include: [{ model: EncargFiduciario, as: 'encargo', attributes: ['nombre', 'codigo', 'archivo_nombre'] }],
    });
    total = count;
    records = rows.map((r) => ({
      id: r.id,
      encargId: r.encarg_id,
      hojaId: r.hoja_id,
      nombreHoja: r.nombre_hoja,
      propietario: r.propietario,
      datos: r.datos,
      encargo: r.encargo ? { nombre: r.encargo.nombre, codigo: r.encargo.codigo, archivoNombre: r.encargo.archivo_nombre } : null,
    }));
  }

  return { data: records, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } };
}

async function listPropietarios({ encargId, search }) {
  const where = { propietario: { [Op.ne]: null } };
  if (encargId) where.encarg_id = encargId;
  if (search) {
    const like = `%${String(search).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.propietario = { [Op.iLike]: like };
  }

  const rows = await MovimientoFiduciario.findAll({
    attributes: ['propietario', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
    where,
    group: ['propietario'],
    order: [['propietario', 'ASC']],
  });

  return rows.map((r) => ({ propietario: r.propietario, total: Number(r.get('total')) }));
}

function limpiarNombreComprador(nombre) {
  return String(nombre || '').replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '');
}

// Lista de nomenclaturas (unidades) del encargo, resuelta desde Negocio --
// filtra por Fideicomiso conteniendo el código del encargo (Nomenclatura/
// Inventario buscados tal cual, sensible a mayúsculas como el legado;
// nombre de comprador insensible). Paginado en memoria porque el filtro real
// (Nomenclatura no nula) no es indexable de forma barata y el volumen por
// encargo es chico (cientos de unidades, no miles).
async function listNomenclaturas(encargoId, { search, page = 1, limit = 50 }) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  const encargo = await EncargFiduciario.findByPk(encargoId, { attributes: ['id', 'nombre', 'codigo'] });
  if (!encargo) return { data: [], pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 } };

  const conds = [`n.datos->>'Nomenclatura' IS NOT NULL`];
  const bind = [];
  let idx = 1;
  if (encargo.codigo) {
    conds.push(`n.datos->>'Fideicomiso' LIKE $${idx++}`);
    bind.push(`%${encargo.codigo}%`);
  }
  if (search) {
    const like = `%${String(search).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(`(
      n.datos->>'Nomenclatura' LIKE $${idx}
      OR n.datos->>'Inventario' LIKE $${idx}
      OR n.id IN (SELECT negocio_id FROM negocio_compradores WHERE nombre ILIKE $${idx})
    )`);
    bind.push(like);
    idx++;
  }

  const rows = await sequelize.query(
    `SELECT
       n.id, n.referencia, n.estado, n.datos, n.saldo_actual,
       (
         SELECT jsonb_build_object('nombre', c.nombre, 'nro_id', c.nro_id)
         FROM negocio_compradores c WHERE c.negocio_id = n.id ORDER BY c.orden ASC LIMIT 1
       ) AS comprador_principal,
       (SELECT COUNT(*)::int FROM negocio_movimientos m WHERE m.negocio_id = n.id) AS total_movimientos
     FROM negocios n
     WHERE ${conds.join(' AND ')}`,
    { bind, type: QueryTypes.SELECT }
  );

  const items = rows.map((r) => {
    const comp = r.comprador_principal;
    return {
      nomenclatura: r.datos.Nomenclatura,
      referencia: r.referencia,
      estado: r.estado,
      compradorPrincipal: comp?.nombre ? limpiarNombreComprador(comp.nombre) : null,
      nroId: comp?.nro_id ?? null,
      saldoActual: r.saldo_actual ?? null,
      totalMovimientos: r.total_movimientos,
      tipo: r.datos?.['Tipo Inmueble'] ?? r.datos?.Categoria ?? null,
      inventario: r.datos?.Inventario ?? null,
    };
  });

  // Orden sobre el set completo y después paginado (si se ordenara después del
  // slice, el bug del sort local de `useSortableTable` volvería).
  const itemsOrdenados = [...items].sort((a, b) => a.nomenclatura.localeCompare(b.nomenclatura, 'es-CO', { numeric: true }));

  const total = itemsOrdenados.length;
  const paginated = itemsOrdenados.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  return { data: paginated, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } };
}

// Detalle de una unidad (apartamento) por Referencia -- clave única de
// Negocio, no Nomenclatura (el número de apartamento se repite entre
// edificios/etapas del mismo fideicomiso).
async function getApartamentoDetalle(encargoId, referencia) {
  const encargo = await EncargFiduciario.findByPk(encargoId, { attributes: ['id', 'nombre', 'codigo'] });
  if (!encargo) throw new ApiError(404, 'Encargo no encontrado');

  const negocio = await Negocio.findOne({
    where: { referencia },
    include: [{ model: NegocioComprador, as: 'compradores', separate: true, order: [['orden', 'ASC']] }],
  });
  if (!negocio) throw new ApiError(404, 'Negocio no encontrado para esta referencia. Ejecuta el backfill en el módulo Negocios.');

  const [totalMovimientos, movimientos] = await Promise.all([
    NegocioMovimiento.count({ where: { negocio_id: negocio.id } }),
    NegocioMovimiento.findAll({
      where: { negocio_id: negocio.id },
      order: [sequelize.literal('fecha_contable DESC NULLS LAST'), ['creado_en', 'DESC']],
      limit: 500,
    }),
  ]);

  return {
    nomenclatura: negocio.datos?.Nomenclatura ?? null,
    encargo: { id: encargo.id, nombre: encargo.nombre, codigo: encargo.codigo },
    negocio: {
      id: negocio.id,
      referencia: negocio.referencia,
      estado: negocio.estado,
      datos: negocio.datos,
      saldoActual: negocio.saldo_actual,
      compradores: negocio.compradores,
    },
    movimientos: movimientos.map((m) => ({ id: m.id, idMovimiento: m.id_movimiento, fechaContable: m.fecha_contable, datos: m.datos })),
    totalMovimientos,
  };
}

module.exports = { listEncargos, getEncargo, getHoja, updateEncargo, removeEncargo, listMovimientos, listPropietarios, listNomenclaturas, getApartamentoDetalle };
