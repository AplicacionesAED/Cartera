// Adaptado de la lógica que en el proyecto legado vivía directo en
// routes/fiducia.js. Los endpoints que cruzan con Negocio
// (encargos/:id/nomenclaturas, encargos/:id/negocio/:referencia) se habían
// diferido a la fase de Negocios (ver fiducia.upload.js) -- ese módulo ya
// existe, así que se agregan acá (mismo criterio que negocio.service.js
// importando el modelo Oportunidad de otro módulo: la ruta vive en el
// namespace de Fiducia, pero cruza datos de Negocio).
const { lista } = require('../../../utils/filtros');
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const ApiError = require('../../../utils/ApiError');
const EncargFiduciario = require('./encargFiduciario.model');
const HojaFiduciaria = require('./hojaFiduciaria.model');
const Negocio = require('../baiaNegocio/baiaNegocio.model');
const NegocioComprador = require('../baiaNegocio/baiaNegocioComprador.model');
const NegocioMovimiento = require('../baiaNegocio/baiaNegocioMovimiento.model');

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
    // Por la fecha del correo (no por cuándo se importó: los de un día entran todos juntos).
    order: [[sequelize.literal('COALESCE(email_fecha, creado_en)'), 'DESC'], ['id', 'DESC']],
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

module.exports = { listEncargos, getEncargo, getHoja, updateEncargo, removeEncargo, listNomenclaturas, getApartamentoDetalle };
