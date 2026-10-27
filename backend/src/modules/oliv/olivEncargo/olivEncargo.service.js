// Equivalente a fiducia.servicio.js (Baía Kristal) pero SIN las páginas de
// detalle que ahí cruzan con Negocio (listNomenclaturas/getApartamentoDetalle)
// -- esas necesitan reglas de negocio propias que todavía no existen para
// Oliv (ver el comentario de cabecera de olivEncargo.upload.js). `listMovimientos`
// SÍ resuelve un cruce puntual (pedido explícito del usuario, 2026-09-14:
// "la idea es que el movimiento te diga todo específicamente"): además de
// Propietario/Valor/Concepto (columnas conocidas del Excel "Saldos
// Acumulados por Concepto y Unidad", ver olivEncargo.upload.js), cada
// movimiento trae también su Negocio -- cruzando la columna ENCARGO del
// Excel contra `olivOportunidad.referencia_recaudo`, y de ahí a
// `OlivInmueble` vía `inmueble_hubspot_id` (mismo cruce que ya usa
// olivNegocio.servicio.js). `negocioId` (formato `inm-`/`op-`, ver
// _negocioPorReferencia) deja enlazar tanto Propietario como Inmueble al
// mismo Negocio desde el frontend.
const { Op } = require('sequelize');
const sequelize = require('../../../config/db');
const ApiError = require('../../../utils/ApiError');
const { parseValorFiducia, buscarCampo, detalleSinDuplicar, COLUMNAS_REFERENCIA_FIDUCIA, COLUMNAS_VALOR_FIDUCIA, COLUMNAS_CONCEPTO_FIDUCIA } = require('../../../utils/olivHelpers');
const olivEncargo = require('./olivEncargo.model');
const OlivHoja = require('./olivHoja.model');
const OlivMovimiento = require('./olivMovimiento.model');
const olivOportunidad = require('../olivOportunidad/olivOportunidad.model');
const OlivInmueble = require('../olivInmueble/olivInmueble.model');
const { invalidarCacheResumenOliv } = require('../olivResumen/olivResumenCache');

// Referencia de Recaudo -> { negocioId, inmueble }, para toda la data de
// Oliv de una sola vez (volumen chico -- decenas de negocios, no miles).
// `negocioId` usa el mismo formato que olivNegocio.servicio.js#_mapFila
// (`inm-<id>` si la Oportunidad tiene inmueble vinculado, `op-<id>` en el
// caso huérfano sin inmueble) -- así el Propietario de un movimiento puede
// enlazar al Negocio igual que ya hace la columna Inmueble, incluso cuando
// todavía no hay inmueble vinculado en HubSpot (pedido explícito del
// usuario, 2026-09-14: "que vincule el propietario del negocio en el
// detalle").
async function _negocioPorReferencia() {
  const [oportunidades, inmuebles] = await Promise.all([
    olivOportunidad.findAll({ attributes: ['id', 'referencia_recaudo', 'inmueble_hubspot_id'], where: { referencia_recaudo: { [Op.ne]: null } }, raw: true }),
    OlivInmueble.findAll({ attributes: ['id', 'hubspot_id', 'codigo_unidad', 'torre'], raw: true }),
  ]);
  const inmueblePorHubspotId = new Map(inmuebles.map((i) => [i.hubspot_id, i]));
  const mapa = new Map();
  for (const op of oportunidades) {
    const inm = op.inmueble_hubspot_id ? inmueblePorHubspotId.get(op.inmueble_hubspot_id) : null;
    mapa.set(op.referencia_recaudo, { negocioId: inm ? `inm-${inm.id}` : `op-${op.id}`, inmueble: inm || null });
  }
  return mapa;
}

async function listEncargos({ search, page = 1, limit = 20 }) {
  const where = {};
  if (search) {
    const like = `%${String(search).replace(/[\\%_]/g, (o) => `\\${o}`)}%`;
    where[Op.or] = [
      { nombre: { [Op.iLike]: like } },
      { codigo: { [Op.iLike]: like } },
      { archivo_nombre: { [Op.iLike]: like } },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const { rows, count } = await olivEncargo.findAndCountAll({
    where,
    offset: (pageNum - 1) * limitNum,
    limit: limitNum,
    order: [['creado_en', 'DESC']],
    include: [{ model: OlivHoja, as: 'hojas', attributes: ['id', 'nombre_hoja', 'total_filas'], separate: true, order: [['nombre_hoja', 'ASC']] }],
  });

  return { data: rows, pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) } };
}

async function getEncargo(id) {
  const encargo = await olivEncargo.findByPk(id, {
    include: [{ model: OlivHoja, as: 'hojas', attributes: ['id', 'nombre_hoja', 'total_filas'], separate: true, order: [['nombre_hoja', 'ASC']] }],
  });
  if (!encargo) throw new ApiError(404, 'Encargo no encontrado');
  return encargo;
}

async function getHoja(encargoId, hojaId, { page = 1, limit = 200 }) {
  const hoja = await OlivHoja.findOne({ where: { id: hojaId, encargo_id: encargoId } });
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

async function updateEncargo(id, { nombre, codigo, fecha }) {
  const encargo = await olivEncargo.findByPk(id);
  if (!encargo) throw new ApiError(404, 'Encargo no encontrado');
  const values = {};
  if (nombre !== undefined) values.nombre = nombre;
  if (codigo !== undefined) values.codigo = codigo;
  // `fecha` nunca se manda vacía a propósito -- es NOT NULL (ver
  // migración 20260924160000), a diferencia de nombre/codigo no tiene un
  // estado "sin valor" válido al que volver.
  if (fecha) values.fecha = fecha;
  if (Object.keys(values).length === 0) throw new ApiError(400, 'Nada que actualizar');
  await encargo.update(values);
  // Cambiar `fecha` (el caso real que motivó esto) cambia directamente la
  // conciliación cacheada del Resumen de Oliv.
  invalidarCacheResumenOliv();
  return encargo;
}

async function removeEncargo(id) {
  const encargo = await olivEncargo.findByPk(id);
  if (!encargo) throw new ApiError(404, 'Encargo no encontrado');
  await encargo.destroy();
  invalidarCacheResumenOliv();
}

async function listMovimientos({ encargoId, propietario, hoja, search, page = 1, limit = 50 }) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  const where = {};
  if (encargoId) where.encargo_id = encargoId;
  if (hoja) where.nombre_hoja = hoja;
  if (propietario) where.propietario = { [Op.iLike]: `%${propietario}%` };
  if (search) {
    const like = `%${String(search).replace(/[\\%_]/g, (o) => `\\${o}`)}%`;
    where[Op.or] = [
      { propietario: { [Op.iLike]: like } },
      sequelize.where(sequelize.cast(sequelize.col('OlivMovimiento.datos'), 'text'), { [Op.iLike]: like }),
    ];
  }

  const [{ rows, count }, hojasRaw, negocioPorReferencia] = await Promise.all([
    OlivMovimiento.findAndCountAll({
      where,
      offset: (pageNum - 1) * limitNum,
      limit: limitNum,
      order: [
        ['propietario', 'ASC'],
        ['creado_en', 'ASC'],
      ],
      include: [{ model: olivEncargo, as: 'encargo', attributes: ['nombre', 'codigo', 'archivo_nombre', 'fecha'] }],
    }),
    OlivMovimiento.findAll({ attributes: ['nombre_hoja'], group: 'nombre_hoja', raw: true }),
    _negocioPorReferencia(),
  ]);

  return {
    data: rows.map((r) => {
      const d = r.datos || {};
      const Referencia = buscarCampo(d, COLUMNAS_REFERENCIA_FIDUCIA);
      const negocio = Referencia ? negocioPorReferencia.get(Referencia) : null;
      const inm = negocio?.inmueble;

      return {
        id: r.id,
        encargoId: r.encargo_id,
        hojaId: r.hoja_id,
        nombreHoja: r.nombre_hoja,
        propietario: r.propietario,
        valor: parseValorFiducia(buscarCampo(d, COLUMNAS_VALOR_FIDUCIA)),
        concepto: buscarCampo(d, COLUMNAS_CONCEPTO_FIDUCIA),
        // Fecha del Excel que trajo este movimiento (`OlivEncargo.fecha`,
        // Jefe Gabriel 2026-09-24) -- una por Encargo, no por fila.
        fecha: r.encargo?.fecha ?? null,
        // camelCase, no `Referencia` con mayúscula -- mismo bug real de
        // casing encontrado y corregido el mismo día en
        // olivNegocio.service.js (el frontend, `OlivMovimientosPage.jsx`,
        // siempre leyó `mov.referencia`, así que la columna "Encargo" del
        // listado de Movimientos quedaba siempre en "—").
        referencia: Referencia,
        // `negocioId` enlaza tanto Propietario como Inmueble al mismo
        // Negocio (pedido explícito del usuario: "que vincule el
        // propietario del negocio en el detalle", igual a como ya enlaza
        // Inmueble) -- puede existir aunque `inmueble` sea null (Oportunidad
        // huérfana sin unidad vinculada en HubSpot todavía, ver
        // olivNegocio.servicio.js#_mapFila).
        negocioId: negocio?.negocioId ?? null,
        inmueble: inm ? { id: inm.id, codigoUnidad: inm.codigo_unidad, torre: inm.torre } : null,
        // Sin lo que ya se ve como columna dedicada (Propietario/Concepto/
        // Valor) -- pedido explícito del usuario: "lo que aparece en la
        // columna no debe aparecer en el detalle".
        datos: detalleSinDuplicar(d),
        encargo: r.encargo ? { nombre: r.encargo.nombre, codigo: r.encargo.codigo, archivoNombre: r.encargo.archivo_nombre, fecha: r.encargo.fecha } : null,
      };
    }),
    pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) },
    hojas: hojasRaw.map((h) => h.nombre_hoja).filter(Boolean).sort(),
  };
}

async function listPropietarios({ encargoId, search }) {
  const where = { propietario: { [Op.ne]: null } };
  if (encargoId) where.encargo_id = encargoId;
  if (search) {
    const like = `%${String(search).replace(/[\\%_]/g, (o) => `\\${o}`)}%`;
    where.propietario = { [Op.iLike]: like };
  }

  const rows = await OlivMovimiento.findAll({
    attributes: ['propietario', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
    where,
    group: ['propietario'],
    order: [['propietario', 'ASC']],
  });

  return rows.map((r) => ({ propietario: r.propietario, total: Number(r.get('total')) }));
}

module.exports = { listEncargos, getEncargo, getHoja, updateEncargo, removeEncargo, listMovimientos, listPropietarios };
