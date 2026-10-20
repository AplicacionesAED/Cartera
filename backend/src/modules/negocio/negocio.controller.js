const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const service = require('./negocio.service');
const { runBackfill, isBackfillRunning, getBackfillResult, getBackfillProgreso } = require('./negocio.backfill');

const list = asyncHandler(async (req, res) => {
  const { search, estado, etapa, frente, torre, vinculacion, page, limit } = req.query;
  ok(res, await service.list({ search, estado, etapa, frente, torre, vinculacion, page, limit }));
});

const getById = asyncHandler(async (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const detalle = await service.getById(id);
  if (detalle === undefined) throw new ApiError(400, 'Id inválido');
  if (detalle === null) throw new ApiError(404, 'No encontrado');
  ok(res, detalle);
});

const getMovimientos = asyncHandler(async (req, res) => {
  const id = decodeURIComponent(req.params.id);
  const { page, limit } = req.query;
  const resultado = await service.getMovimientos(id, { page, limit });
  if (resultado === undefined) throw new ApiError(400, 'Id inválido');
  if (resultado === null) throw new ApiError(404, 'No encontrado');
  ok(res, resultado);
});

const listMovimientos = asyncHandler(async (req, res) => {
  const { search, fideicomiso, estado, tipoMovimiento, fechaDesde, fechaHasta, page, limit } = req.query;
  ok(res, await service.listMovimientos({ search, fideicomiso, estado, tipoMovimiento, fechaDesde, fechaHasta, page, limit }));
});

const exportMovimientos = asyncHandler(async (req, res) => {
  const { search, fideicomiso, estado, tipoMovimiento, fechaDesde, fechaHasta } = req.query;
  ok(res, await service.exportMovimientos({ search, fideicomiso, estado, tipoMovimiento, fechaDesde, fechaHasta }));
});

const updateFlags = asyncHandler(async (req, res) => ok(res, await service.updateFlags(req.params.negocioId, req.body)));

const iniciarBackfill = asyncHandler(async (req, res) => {
  if (isBackfillRunning()) return ok(res, { message: 'Backfill ya en ejecución', running: true });
  ok(res, { message: 'Backfill iniciado en segundo plano', running: true });
  runBackfill();
});

const backfillStatus = asyncHandler(async (req, res) => ok(res, { running: isBackfillRunning(), result: getBackfillResult(), progreso: getBackfillProgreso() }));

module.exports = { list, getById, getMovimientos, listMovimientos, exportMovimientos, updateFlags, iniciarBackfill, backfillStatus };
