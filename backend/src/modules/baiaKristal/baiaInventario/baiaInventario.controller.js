const asyncHandler = require('../../../utils/asyncHandler');
const { ok } = require('../../../utils/ApiResponse');
const service = require('./baiaInventario.service');
const { syncInventario, getSyncStatus } = require('./baiaInventario.sync');

const list = asyncHandler(async (req, res) => {
  const { search, proyecto, categoria, estado, estadoFiducia, etapa, frente, torre, page, limit } = req.query;
  ok(res, await service.list({ search, proyecto, categoria, estado, estadoFiducia, etapa, frente, torre, page, limit }));
});

const getById = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));

const iniciarSync = asyncHandler(async (req, res) => {
  ok(res, { message: 'Sincronización iniciada' });
  syncInventario();
});

const syncStatus = asyncHandler(async (req, res) => ok(res, getSyncStatus()));

module.exports = { list, getById, iniciarSync, syncStatus };
