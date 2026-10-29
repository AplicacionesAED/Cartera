// Adaptado del subconjunto de zoho-payment-tracker/backend/src/baia-kristal/services/inventarioNegocioService.js
// que cruza InventarioItem con Negocio/Opportunity (listarNegociosInventario,
// obtenerNegocioPorId, obtenerMovimientosPorId, findOportunidadByReferencia,
// resolverNegocioIdDesdeInmueble) -- la mitad que solo tocaba InventarioItem
// ya se portó en la fase de Inventario (inventarioTorres.service.js).
//
// El CTE combinado (InventarioItem + Negocio, incluidos los "huérfanos" sin
// inmueble) usa SQL crudo con bind parameters posicionales ($1, $2...), no
// `replacements` con nombre -- ver la regla en CLAUDE.md.
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const ApiError = require('../../../utils/ApiError');
const Negocio = require('./baiaNegocio.model');
const NegocioComprador = require('./baiaNegocioComprador.model');
const { invalidarCacheDashboard } = require('../baiaDashboard/baiaDashboardCache');
const NegocioMovimiento = require('./baiaNegocioMovimiento.model');
const { lista } = require('../../../utils/filtros');
const { PROYECTO_TORRE_EXCLUIDOS, proyectosTorreDeFiltros, valoresProyectoTorre, compararEtapas, esFrenteSeleccionable, parseProyectoTorre, formatearProyectoTorre, obtenerEtapaTorre, parsePisoNumero, nomenclaturaCompleta, nomenclaturaCompletaSQL } = require('../baiaInventario/baiaInventarioTorres.service');
const { elegirOportunidadVigente } = require('../../../config/estadosOportunidad');
const Oportunidad = require('../baiaOportunidad/baiaOportunidad.model');

const { PRIORIDAD_ESTADO_SQL } = require('../baiaVinculo/baiaVinculoResolver');

const SIN_PROYECTO = 'Sin proyecto';
const PATRON_NOMBRE_EXCLUIDO = '*%';

const BASE_CTE = `
WITH inmuebles AS (
  SELECT
    ('inv-' || inv.id) AS id,
    inv.datos AS inventario_datos,
    inv.proyecto AS inv_proyecto,
    inv.torre AS inv_torre,
    inv.piso AS inv_piso,
    inv.nombre AS inv_nombre,
    neg.id AS negocio_id,
    neg.referencia AS referencia,
    neg.estado AS estado,
    neg.saldo_actual AS saldo_actual,
    neg.datos AS negocio_datos,
    neg.desvinculado AS desvinculado,
    neg.v_metodo AS vinculo_metodo
  FROM inventario_items inv
  LEFT JOIN LATERAL (
    -- El negocio de cada inmueble lo decide vinculoResolver.js (tres señales) y queda en vinculos_negocio_inmueble;
    -- si una unidad tiene varios negocios, cuenta el vigente.
    SELECT n.*, v.metodo AS v_metodo FROM vinculos_negocio_inmueble v
    JOIN negocios n ON n.referencia = v.referencia
    WHERE v.inventario_id = inv.id
    ORDER BY ${PRIORIDAD_ESTADO_SQL}, n.id ASC
    LIMIT 1
  ) neg ON true
),
huerfanos AS (
  SELECT
    ('neg-' || n.id) AS id,
    NULL::jsonb AS inventario_datos,
    NULL::text AS inv_proyecto,
    NULL::text AS inv_torre,
    NULL::text AS inv_piso,
    NULL::text AS inv_nombre,
    n.id AS negocio_id,
    n.referencia AS referencia,
    n.estado AS estado,
    n.saldo_actual AS saldo_actual,
    n.datos AS negocio_datos,
    n.desvinculado AS desvinculado,
    NULL::text AS vinculo_metodo
  FROM negocios n
  WHERE NOT EXISTS (SELECT 1 FROM inmuebles i WHERE i.negocio_id = n.id)
),
combinado AS (
  SELECT * FROM inmuebles
  WHERE COALESCE(inventario_datos->>'Proyecto_Torre', '') <> ALL($1::text[])
    AND COALESCE(inventario_datos->>'Product_Name', '') NOT LIKE $2
  UNION ALL
  SELECT * FROM huerfanos
)
`;

// Arma las condiciones dinámicas del WHERE del CTE combinado. `bind` ya
// trae los 2 parámetros base de BASE_CTE ($1 excluidos, $2 patrón nombre) --
// esta función sigue numerando desde ahí.
async function construirFiltroCombinado({ search, estado, etapa, frente, torre, vinculacion, valores, bind }) {
  // Negocios solo lista negocios reales: los inmuebles sin negocio vinculado no aparecen.
  const condiciones = ['c.negocio_id IS NOT NULL'];
  let idx = bind.length + 1;

  // Forma en que el negocio quedó vinculado a su inmueble (ver vinculoResolver.js). Varias = OR.
  const vincs = lista(vinculacion);
  if (vincs.length) {
    const ors = [];
    if (vincs.includes('nomenclatura')) ors.push(`c.vinculo_metodo = 'nomenclatura'`);
    if (vincs.includes('referencia')) ors.push(`c.vinculo_metodo = 'referencia'`);
    if (vincs.includes('sin')) ors.push(`(c.negocio_id IS NOT NULL AND c.inventario_datos IS NULL)`);
    if (vincs.includes('desvinculado')) ors.push(`c.desvinculado`);
    if (ors.length) condiciones.push(`(${ors.join(' OR ')})`);
  }

  const estados = lista(estado);
  if (estados.length) {
    condiciones.push(`c.estado ILIKE ANY($${idx++}::text[])`);
    bind.push(estados.map((e) => `%${e}%`));
  }
  if (search) {
    condiciones.push(`(
      c.referencia ILIKE $${idx}
      OR c.negocio_datos->>'Nomenclatura' ILIKE $${idx}
      OR ${nomenclaturaCompletaSQL('c')} ILIKE $${idx}
      OR c.inventario_datos->>'Proyecto_Torre' ILIKE $${idx}
      OR c.inventario_datos->>'Product_Name' ILIKE $${idx}
      OR EXISTS (
        SELECT 1 FROM negocio_compradores comp
        WHERE comp.negocio_id = c.negocio_id
          AND (comp.nombre ILIKE $${idx} OR comp.nro_id ILIKE $${idx})
      )
    )`);
    bind.push(`%${search}%`);
    idx++;
  }
  const proy = proyectosTorreDeFiltros(valores, { etapas: lista(etapa), frentes: lista(frente), torres: lista(torre) });
  if (proy) {
    const partes = [`c.inventario_datos->>'Proyecto_Torre' = ANY($${idx++}::text[])`];
    bind.push(proy.lista);
    if (proy.sinProyecto) partes.push(`c.inventario_datos IS NULL`);
    condiciones.push(`(${partes.join(' OR ')})`);
  }

  return { whereSQL: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', idx };
}

async function list({ search, estado, etapa, frente, torre, vinculacion, page = 1, limit = 50 }) {
  const valores = await valoresProyectoTorre();
  const bind = [[...PROYECTO_TORRE_EXCLUIDOS], PATRON_NOMBRE_EXCLUIDO];
  const { whereSQL, idx } = await construirFiltroCombinado({ search, estado, etapa, frente, torre, vinculacion, valores, bind });

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(9999, Math.max(1, Number(limit) || 50));

  const [totalRows, filas, estadosRaw] = await Promise.all([
    sequelize.query(`${BASE_CTE} SELECT COUNT(*)::int AS total FROM combinado c ${whereSQL}`, { bind, type: QueryTypes.SELECT }),
    sequelize.query(
      `${BASE_CTE}
       SELECT
         c.id, c.inventario_datos, c.inv_proyecto, c.inv_torre, c.inv_piso, c.inv_nombre, c.negocio_id, c.referencia, c.estado, c.saldo_actual, c.negocio_datos, c.desvinculado,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('id', comp.id, 'nombre', comp.nombre, 'nroId', comp.nro_id, 'porcentaje', comp.porcentaje, 'orden', comp.orden) ORDER BY comp.orden)
           FROM negocio_compradores comp WHERE comp.negocio_id = c.negocio_id
         ), '[]'::jsonb) AS compradores,
         (SELECT COUNT(*)::int FROM negocio_movimientos m WHERE m.negocio_id = c.negocio_id) AS total_movimientos
       FROM combinado c
       ${whereSQL}
       ORDER BY c.inventario_datos->>'Proyecto_Torre' ASC NULLS LAST, c.inv_nombre ASC NULLS LAST
       LIMIT $${idx} OFFSET $${idx + 1}`,
      { bind: [...bind, limitNum, (pageNum - 1) * limitNum], type: QueryTypes.SELECT }
    ),
    sequelize.query(`SELECT DISTINCT estado FROM negocios WHERE estado IS NOT NULL ORDER BY estado ASC`, { type: QueryTypes.SELECT }),
  ]);
  const total = totalRows[0]?.total ?? 0;

  const data = filas.map((f) => {
    const info = parseProyectoTorre(f.inventario_datos?.Proyecto_Torre);
    return {
      id: f.id,
      tieneNegocio: f.negocio_id != null,
      referencia: f.referencia,
      estado: f.estado,
      saldoActual: f.saldo_actual,
      desvinculado: f.desvinculado === true,
      datos: f.negocio_datos,
      compradores: f.compradores,
      totalMovimientos: f.total_movimientos,
      nomenclaturaCompleta: nomenclaturaCompleta({ proyecto: f.inv_proyecto, torre: f.inv_torre, piso: f.inv_piso, nombre: f.inv_nombre, datos: f.inventario_datos }),
      proyectoTorre: info ? formatearProyectoTorre(info) : null,
      etapa: info ? obtenerEtapaTorre(f.inventario_datos.Proyecto_Torre) : SIN_PROYECTO,
    };
  });

  return {
    data,
    total,
    ...(estadosRaw ? { estados: estadosRaw.map((e) => e.estado).filter(Boolean) } : {}),
    etapasDisponibles: [...valores.porEtapa.keys(), SIN_PROYECTO].sort(compararEtapas),
    frentesDisponibles: [...valores.porFrente.keys()].filter(esFrenteSeleccionable).sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

async function findOportunidadByReferencia(referencia) {
  if (!referencia) return null;
  const attrs = ['id', 'deal_name', 'stage', 'referencia_recaudo', 'pago_separacion', 'fecha_inicio_plan_pagos', 'campos_financieros', 'seccion_inmueble', 'ultimo_sync_en'];
  let candidatas = await Oportunidad.findAll({ where: { referencia_recaudo: referencia }, attributes: attrs, raw: true });
  if (candidatas.length === 0 && referencia.length >= 6) {
    candidatas = await Oportunidad.findAll({ where: { referencia_recaudo: { [Op.iLike]: `%${referencia}%` } }, attributes: attrs, raw: true });
  }
  const elegida = elegirOportunidadVigente(candidatas.map((c) => ({ ...c, stage: c.stage })));
  if (!elegida) return null;
  return {
    id: elegida.id,
    dealName: elegida.deal_name,
    stage: elegida.stage,
    referenciaRecaudo: elegida.referencia_recaudo,
    pagoSeparacion: elegida.pago_separacion,
    fechaInicioPlanPagos: elegida.fecha_inicio_plan_pagos,
    camposFinancieros: elegida.campos_financieros,
    seccionInmueble: elegida.seccion_inmueble,
    lastSyncedAt: elegida.ultimo_sync_en,
  };
}

async function resolverNegocioIdDesdeInmueble(inmueble) {
  // Misma decisión que el listado: la tabla de vínculos (vinculoResolver.js).
  const rows = await sequelize.query(
    `SELECT n.id FROM vinculos_negocio_inmueble v JOIN negocios n ON n.referencia = v.referencia
     WHERE v.inventario_id = $1 ORDER BY ${PRIORIDAD_ESTADO_SQL}, n.id ASC LIMIT 1`,
    { bind: [inmueble.id], type: QueryTypes.SELECT }
  );
  return rows[0]?.id ?? null;
}

// TOTAL PAGADO de la conciliación de un negocio: la suma de sus movimientos fiduciarios ya normalizados (sin los
// 'GENERADO POR VENTA UNIDAD' y contando solo desde el último desistimiento/ajuste que cancela), con EXACTAMENTE el mismo
// cálculo de la pestaña Conciliación y de Cartera/Dashboard. El 'Saldo Actual' que trae el Excel de la fiducia no sirve
// para esto: en cientos de negocios dice 0 aunque ya hayan pagado.
async function totalPagadoDeNegocio(negocio, etapa = null) {
  const { normalizarPagos, construirPlan, saldoAFavorDelPlan } = require('../baiaDashboard/conciliacion');
  const { resolverValorVenta } = require('../baiaDashboard/baiaDashboard.service');
  const movs = await NegocioMovimiento.findAll({ where: { negocio_id: negocio.id }, attributes: ['id_movimiento', 'fecha_contable', 'datos'], raw: true });
  const pagos = normalizarPagos(movs.map((m) => ({ idMovimiento: m.id_movimiento, fechaContable: m.fecha_contable, datos: m.datos })));
  const pagado = pagos.reduce((s, p) => s + p.valor, 0);

  // Saldo a favor del plan (cuota negativa): se suma al total pagado, igual que en la pestaña Conciliación.
  let saldoAFavor = 0;
  const opps = negocio.referencia
    ? await Oportunidad.findAll({ where: { referencia_recaudo: negocio.referencia }, attributes: ['id', 'stage', 'fecha_inicio_plan_pagos', 'propuesta_pago', 'forma_pago'], raw: true })
    : [];
  const opp = elegirOportunidadVigente(opps);
  if (opp) {
    const esPlanNegociado = !!opp.propuesta_pago?.length;
    const plan = construirPlan(esPlanNegociado ? opp.propuesta_pago : opp.forma_pago || [], opp.fecha_inicio_plan_pagos, { esPlanNegociado });
    const valorVenta = resolverValorVenta(negocio, etapa);
    if (valorVenta != null && !Number.isNaN(valorVenta) && plan.length >= 2) {
      plan[plan.length - 1].valorPlan = valorVenta - plan.slice(0, -1).reduce((s, c) => s + c.valorPlan, 0);
    }
    if (plan.length > 0) saldoAFavor = saldoAFavorDelPlan(plan);
  }
  return pagado + saldoAFavor;
}

const INCLUDE_NEGOCIO_DETALLE = [{ model: NegocioComprador, as: 'compradores', separate: true, order: [['orden', 'ASC']] }];

async function getById(id) {
  const InventarioItem = require('../baiaInventario/baiaInventarioItem.model');

  if (id.startsWith('inv-')) {
    const inventarioId = id.slice('inv-'.length);
    const inmueble = await InventarioItem.findByPk(inventarioId);
    if (!inmueble) return null;

    const negocioId = await resolverNegocioIdDesdeInmueble(inmueble);
    const negocio = negocioId ? await Negocio.findByPk(negocioId, { include: INCLUDE_NEGOCIO_DETALLE }) : null;
    const totalMovimientos = negocio ? await NegocioMovimiento.count({ where: { negocio_id: negocio.id } }) : 0;
    const infoProyecto = parseProyectoTorre(inmueble.datos?.Proyecto_Torre);
    const etapaNegocio = infoProyecto ? obtenerEtapaTorre(inmueble.datos.Proyecto_Torre) : null;
    const totalPagado = negocio ? await totalPagadoDeNegocio(negocio, etapaNegocio) : null;

    const oportunidad = await findOportunidadByReferencia(negocio?.referencia ?? null);
    const info = parseProyectoTorre(inmueble.datos?.Proyecto_Torre);
    return {
      id,
      tieneNegocio: !!negocio,
      referencia: negocio?.referencia ?? null,
      estado: negocio?.estado ?? null,
      datos: negocio?.datos ?? null,
      saldoActual: negocio?.saldo_actual ?? null,
      totalPagado,
      compradores: negocio?.compradores ?? [],
      totalMovimientos,
      oportunidad,
      codigoInmueble: inmueble.datos?.C_digo_inmueble ?? null,
      nomenclaturaCompleta: nomenclaturaCompleta({ proyecto: inmueble.proyecto, torre: inmueble.torre, piso: inmueble.piso, nombre: inmueble.nombre, datos: inmueble.datos }),
      proyectoTorre: info ? formatearProyectoTorre(info) : null,
      frente: info ? info.proyecto : null,
      torre: info ? info.torre : null,
      piso: parsePisoNumero(inmueble.piso),
      etapa: info ? obtenerEtapaTorre(inmueble.datos.Proyecto_Torre) : null,
      inventarioDatos: inmueble.datos ?? null,
      negocioId: negocio?.id ?? null,
      negocioActualizadoEl: negocio?.actualizado_en ?? null,
    };
  }

  if (id.startsWith('neg-')) {
    const negocioId = id.slice('neg-'.length);
    const negocio = await Negocio.findByPk(negocioId, { include: INCLUDE_NEGOCIO_DETALLE });
    if (!negocio) return null;
    const totalMovimientos = await NegocioMovimiento.count({ where: { negocio_id: negocio.id } });
    const totalPagado = await totalPagadoDeNegocio(negocio, null);
    const oportunidad = await findOportunidadByReferencia(negocio.referencia);
    return {
      id,
      tieneNegocio: true,
      referencia: negocio.referencia,
      estado: negocio.estado,
      datos: negocio.datos,
      saldoActual: negocio.saldo_actual,
      totalPagado,
      compradores: negocio.compradores,
      totalMovimientos,
      oportunidad,
      codigoInmueble: null,
      nomenclaturaCompleta: null,
      proyectoTorre: null,
      frente: null,
      torre: null,
      piso: null,
      etapa: null,
      inventarioDatos: null,
      negocioId: negocio.id,
      negocioActualizadoEl: negocio.actualizado_en ?? null,
    };
  }

  return undefined;
}

async function getMovimientos(id, { page = 1, limit = 50 }) {
  const InventarioItem = require('../baiaInventario/baiaInventarioItem.model');
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  let negocioId = null;
  if (id.startsWith('inv-')) {
    const inmueble = await InventarioItem.findByPk(id.slice('inv-'.length));
    if (!inmueble) return null;
    negocioId = await resolverNegocioIdDesdeInmueble(inmueble);
  } else if (id.startsWith('neg-')) {
    const negocio = await Negocio.findByPk(id.slice('neg-'.length), { attributes: ['id'] });
    if (!negocio) return null;
    negocioId = negocio.id;
  } else {
    return undefined;
  }

  if (!negocioId) return { data: [], pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 } };

  // Misma forma de fila que la grilla general de Movimientos (mapMovimientoRow), acotada al negocio.
  const [movimientos, totalRows] = await Promise.all([
    sequelize.query(
      `${SELECT_MOVIMIENTOS} WHERE m.negocio_id = $1 ORDER BY m.fecha_contable DESC NULLS LAST, m.creado_en DESC LIMIT $2 OFFSET $3`,
      { bind: [negocioId, limitNum, (pageNum - 1) * limitNum], type: QueryTypes.SELECT }
    ),
    sequelize.query(`SELECT COUNT(*)::int AS total FROM negocio_movimientos m WHERE m.negocio_id = $1`, { bind: [negocioId], type: QueryTypes.SELECT }),
  ]);
  const total = totalRows[0]?.total ?? 0;

  // fecha_contable/id_movimiento: la conciliación y el estado de cuenta (PDF) los leen en crudo.
  const data = movimientos.map((m) => ({ ...mapMovimientoRow(m), fecha_contable: m.fecha_contable, id_movimiento: m.id_movimiento }));
  return { data, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } };
}

// Construye el WHERE de negocio_movimientos a partir de los mismos filtros
// que usa la grilla de /movimientos -- compartido con exportMovimientos
// para que la exportación respete exactamente los mismos filtros aplicados.
// Devuelve `null` si hay filtros de negocio pero ninguno coincide (sin match) --
// mismo comportamiento que el legado: en ese caso NO cae a buscar por
// idMovimiento aunque el texto de búsqueda pudiera matchear ahí.
async function resolverMovimientosWhere({ search, fideicomiso, estado, tipoMovimiento, fechaDesde, fechaHasta }) {
  const negocioConds = [];
  const negBind = [];
  let ni = 1;
  const estados = lista(estado);
  if (estados.length) {
    negocioConds.push(`estado ILIKE ANY($${ni++}::text[])`);
    negBind.push(estados.map((e) => `%${e}%`));
  }
  const fideicomisos = lista(fideicomiso);
  if (fideicomisos.length) {
    negocioConds.push(`datos->>'Fideicomiso' LIKE ANY($${ni++}::text[])`);
    negBind.push(fideicomisos.map((f) => `%${f}%`));
  }
  if (search) {
    negocioConds.push(`(
      referencia ILIKE $${ni++}
      OR id IN (SELECT negocio_id FROM negocio_compradores WHERE nombre ILIKE $${ni++})
      OR id IN (SELECT negocio_id FROM negocio_compradores WHERE nro_id ILIKE $${ni++})
      OR datos->>'Nomenclatura' LIKE $${ni++}
    )`);
    negBind.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const hasNegocioFilters = negocioConds.length > 0;
  let negocioIds = null;
  if (hasNegocioFilters) {
    const rows = await sequelize.query(`SELECT id FROM negocios WHERE ${negocioConds.join(' AND ')}`, { bind: negBind, type: QueryTypes.SELECT });
    negocioIds = rows.map((r) => r.id);
    if (negocioIds.length === 0) return null;
  }

  const orParts = [];
  const movBind = [];
  let mi = 1;
  if (negocioIds !== null) {
    orParts.push(`m.negocio_id = ANY($${mi++}::integer[])`);
    movBind.push(negocioIds);
  }
  if (search) {
    orParts.push(`m.id_movimiento ILIKE $${mi++}`);
    movBind.push(`%${search}%`);
  }

  const movConds = [];
  if (orParts.length > 0) movConds.push(`(${orParts.join(' OR ')})`);
  const tiposMov = lista(tipoMovimiento);
  if (tiposMov.length) {
    movConds.push(`m.datos->>'Tipo Movimiento' = ANY($${mi++}::text[])`);
    movBind.push(tiposMov);
  }
  if (fechaDesde) {
    movConds.push(`m.fecha_contable >= $${mi++}`);
    movBind.push(new Date(fechaDesde));
  }
  if (fechaHasta) {
    const d = new Date(fechaHasta);
    d.setHours(23, 59, 59, 999);
    movConds.push(`m.fecha_contable <= $${mi++}`);
    movBind.push(d);
  }

  return { whereSQL: movConds.length ? `WHERE ${movConds.join(' AND ')}` : '', bind: movBind, nextIdx: mi };
}

function mapMovimientoRow(m) {
  return {
    id: m.id,
    referencia: m.referencia,
    fechaContable: m.fecha_contable,
    datos: m.datos,
    negocio: m.n_id != null
      ? {
          // Ruta del negocio en el frontend: por su inmueble si está vinculado, si no por el negocio mismo.
          enlaceId: m.v_inventario_id != null ? `inv-${m.v_inventario_id}` : `neg-${m.n_id}`,
          estado: m.n_estado,
          fideicomiso: m.n_datos?.Fideicomiso ?? null,
          nomenclatura: m.n_datos?.Nomenclatura ?? null,
          inventario: m.n_datos?.Inventario ?? null,
          compradores: m.compradores,
        }
      : null,
  };
}

const SELECT_MOVIMIENTOS = `
  SELECT
    m.id, m.id_movimiento, m.referencia, m.fecha_contable, m.datos,
    n.id AS n_id, n.estado AS n_estado, n.datos AS n_datos,
    (SELECT v.inventario_id FROM vinculos_negocio_inmueble v WHERE v.referencia = n.referencia LIMIT 1) AS v_inventario_id,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', comp.id, 'nombre', comp.nombre, 'nroId', comp.nro_id, 'porcentaje', comp.porcentaje, 'orden', comp.orden) ORDER BY comp.orden)
      FROM negocio_compradores comp WHERE comp.negocio_id = n.id
    ), '[]'::jsonb) AS compradores
  FROM negocio_movimientos m
  LEFT JOIN negocios n ON n.id = m.negocio_id
`;

// Opciones de los filtros de Movimientos: siempre sobre todo el universo, no sobre el resultado filtrado (si no, un
// filtro sin coincidencias haría desaparecer los selectores).
async function opcionesMovimientos() {
  const [fideicomisosRaw, estadosRaw, tiposMovRaw] = await Promise.all([
    sequelize.query(`SELECT DISTINCT datos->>'Fideicomiso' AS fideicomiso FROM negocios WHERE datos->>'Fideicomiso' IS NOT NULL AND datos->>'Fideicomiso' != '' ORDER BY 1`, { type: QueryTypes.SELECT }),
    sequelize.query(`SELECT DISTINCT estado FROM negocios WHERE estado IS NOT NULL ORDER BY estado ASC`, { type: QueryTypes.SELECT }),
    sequelize.query(`SELECT DISTINCT datos->>'Tipo Movimiento' AS tipo FROM negocio_movimientos WHERE datos->>'Tipo Movimiento' IS NOT NULL AND datos->>'Tipo Movimiento' != '' ORDER BY 1`, { type: QueryTypes.SELECT }),
  ]);
  return {
    fideicomisos: fideicomisosRaw.map((r) => r.fideicomiso).filter(Boolean),
    estados: estadosRaw.map((e) => e.estado).filter(Boolean),
    tiposMovimiento: tiposMovRaw.map((r) => r.tipo).filter(Boolean),
  };
}

async function listMovimientos({ search, fideicomiso, estado, tipoMovimiento, fechaDesde, fechaHasta, page = 1, limit = 50 }) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  const resuelto = await resolverMovimientosWhere({ search, fideicomiso, estado, tipoMovimiento, fechaDesde, fechaHasta });
  if (resuelto === null) {
    return {
      data: [],
      pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 },
      ...(await opcionesMovimientos()),
    };
  }
  const { whereSQL, bind, nextIdx } = resuelto;

  const [totalRows, movimientos, opciones] = await Promise.all([
    sequelize.query(`SELECT COUNT(*)::int AS total FROM negocio_movimientos m ${whereSQL}`, { bind, type: QueryTypes.SELECT }),
    sequelize.query(
      `${SELECT_MOVIMIENTOS} ${whereSQL} ORDER BY m.fecha_contable DESC NULLS LAST, m.creado_en DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      { bind: [...bind, limitNum, (pageNum - 1) * limitNum], type: QueryTypes.SELECT }
    ),
    opcionesMovimientos(),
  ]);
  const total = totalRows[0]?.total ?? 0;

  return {
    data: movimientos.map(mapMovimientoRow),
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    ...opciones,
  };
}

async function exportMovimientos({ search, fideicomiso, estado, tipoMovimiento, fechaDesde, fechaHasta }) {
  const resuelto = await resolverMovimientosWhere({ search, fideicomiso, estado, tipoMovimiento, fechaDesde, fechaHasta });
  if (resuelto === null) return { data: [] };
  const { whereSQL, bind } = resuelto;

  const movimientos = await sequelize.query(`${SELECT_MOVIMIENTOS} ${whereSQL} ORDER BY m.fecha_contable DESC NULLS LAST, m.creado_en DESC`, {
    bind,
    type: QueryTypes.SELECT,
  });

  return { data: movimientos.map(mapMovimientoRow) };
}

async function updateFlags(negocioId, { enTramite, esCanje }) {
  const negocio = await Negocio.findByPk(negocioId);
  if (!negocio) throw new ApiError(404, 'Negocio no encontrado');
  const values = {};
  if (typeof enTramite === 'boolean') values.en_tramite = enTramite;
  if (typeof esCanje === 'boolean') values.es_canje = esCanje;
  if (Object.keys(values).length === 0) throw new ApiError(400, 'Nada que actualizar');
  await negocio.update(values);
  invalidarCacheDashboard();
  return { id: negocio.id, enTramite: negocio.en_tramite, esCanje: negocio.es_canje };
}

module.exports = { list, getById, getMovimientos, listMovimientos, exportMovimientos, updateFlags, findOportunidadByReferencia, resolverNegocioIdDesdeInmueble };
