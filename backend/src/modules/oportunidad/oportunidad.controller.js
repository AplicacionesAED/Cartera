const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const service = require('./oportunidad.service');
const { syncOportunidadesFromZoho } = require('./oportunidad.sync');
const { syncInventario } = require('../inventario/inventario.sync');
const { runSubformsBackfill, isSubformsBackfillRunning, getSubformsBackfillResult, getSubformsBackfillProgreso } = require('./oportunidad.subformsBackfill');
const SyncLog = require('./syncLog.model');
const { progresoSync } = require('../../utils/progresoSync');

const list = asyncHandler(async (req, res) => {
  const { stage, search, etapa, frente, torre, sortBy, sortDir, page, limit } = req.query;
  ok(res, await service.list({ stage, search, etapa, frente, torre, sortBy, sortDir, page, limit }));
});

const stages = asyncHandler(async (req, res) => ok(res, await service.listStages()));

const camposMetadata = asyncHandler(async (req, res) => ok(res, await service.listCamposMetadata()));

const getById = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));

const getSubforms = asyncHandler(async (req, res) => ok(res, await service.getSubforms(req.params.id)));

const refrescarSubforms = asyncHandler(async (req, res) => ok(res, await service.refrescarSubforms(req.params.id)));

const iniciarSync = asyncHandler(async (req, res) => {
  const force = req.query.full === 'true';
  ok(res, { message: 'Sincronización iniciada' });
  syncOportunidadesFromZoho(force).catch((err) => console.error('[sync] Error en sync manual:', err.message)); // eslint-disable-line no-console
  // Jefe Gabriel, 2026-10-01: al sincronizar Oportunidades también se
  // sincronizan los Inmuebles (Inventario). Solo upsert, nunca borra filas --
  // `syncInventario` ya tiene su propia guarda de "ya en ejecución" y no lanza,
  // así que un fallo acá nunca afecta al sync de Oportunidades.
  syncInventario();
});

function _mapSyncLog(log) {
  return { status: log.status, iniciadoEn: log.iniciado_en, finalizadoEn: log.finalizado_en, registrosSync: log.registros_sync, errorMsg: log.error_msg };
}

const syncStatus = asyncHandler(async (req, res) => {
  const last = await SyncLog.findOne({ order: [['iniciado_en', 'DESC']] });
  ok(res, { ...(last ? _mapSyncLog(last) : { status: 'never' }), progreso: progresoSync('oportunidades').snapshot() });
});

// GET /oportunidades/sync/logs?limit=5 -- historial de sincronizaciones,
// usado por el footer de "Resumen Gerencial" (última sync + últimas N OK/error).
const syncLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit ?? '5', 10)));
  const logs = await SyncLog.findAll({ order: [['iniciado_en', 'DESC']], limit });
  ok(res, logs.map(_mapSyncLog));
});

const iniciarBackfill = asyncHandler(async (req, res) => {
  if (isSubformsBackfillRunning()) {
    return ok(res, { message: 'Backfill de planes de pago ya en ejecución', running: true });
  }
  ok(res, { message: 'Backfill de planes de pago iniciado en segundo plano', running: true });
  runSubformsBackfill(req.query.todos === 'true');
});

const backfillStatus = asyncHandler(async (req, res) => ok(res, { running: isSubformsBackfillRunning(), result: getSubformsBackfillResult(), progreso: getSubformsBackfillProgreso() }));

module.exports = { list, stages, camposMetadata, getById, getSubforms, refrescarSubforms, iniciarSync, syncStatus, syncLogs, iniciarBackfill, backfillStatus };
