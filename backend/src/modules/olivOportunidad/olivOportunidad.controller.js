const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const service = require('./olivOportunidad.service');
const { syncOportunidadesOliv } = require('./olivOportunidad.sync');
const { syncInmueblesOliv } = require('../olivInmueble/olivInmueble.sync');
const OlivSyncLog = require('./olivSyncLog.model');
const { progresoSync } = require('../../utils/progresoSync');

const list = asyncHandler(async (req, res) => {
  const { search, stage, torre, estadoInmueble, sortBy, sortDir, page, limit } = req.query;
  ok(res, await service.list({ search, stage, torre, estadoInmueble, sortBy, sortDir, page, limit }));
});

const stages = asyncHandler(async (req, res) => ok(res, await service.listStages()));

const getById = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));

const propiedadesMetadata = asyncHandler(async (req, res) => ok(res, await service.listPropiedadesMetadata()));

const status = asyncHandler(async (req, res) => ok(res, await service.status()));

const iniciarSync = asyncHandler(async (req, res) => {
  ok(res, { message: 'Sincronización iniciada' });
  syncOportunidadesOliv().catch((err) => console.error('[oliv-sync] Error en sync manual:', err.message)); // eslint-disable-line no-console
  // Jefe Gabriel, 2026-10-01: al sincronizar Oportunidades también se
  // sincronizan los Inmuebles. Solo upsert, nunca borra filas --
  // `syncInmueblesOliv` ya tiene su propia guarda de "ya en ejecución" y no
  // lanza, así que un fallo acá nunca afecta al sync de Oportunidades.
  syncInmueblesOliv();
});

function _mapSyncLog(log) {
  return { status: log.status, iniciadoEn: log.iniciado_en, finalizadoEn: log.finalizado_en, registrosSync: log.registros_sync, errorMsg: log.error_msg };
}

const syncStatus = asyncHandler(async (req, res) => {
  const last = await OlivSyncLog.findOne({ order: [['iniciado_en', 'DESC']] });
  ok(res, { ...(last ? _mapSyncLog(last) : { status: 'never' }), progreso: progresoSync('oliv-oportunidades').snapshot() });
});

module.exports = { list, stages, getById, propiedadesMetadata, status, iniciarSync, syncStatus };
