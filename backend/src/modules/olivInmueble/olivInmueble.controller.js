const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const service = require('./olivInmueble.service');
const { syncInmueblesOliv, getSyncStatus } = require('./olivInmueble.sync');

const list = asyncHandler(async (req, res) => {
  const { search, torre, categoria, estado, page, limit } = req.query;
  ok(res, await service.list({ search, torre, categoria, estado, page, limit }));
});

const getById = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));

const iniciarSync = asyncHandler(async (req, res) => {
  ok(res, { message: 'Sincronización iniciada' });
  syncInmueblesOliv(req.query.full === 'true' ? 'todo' : 'cambios');
});

const syncStatus = asyncHandler(async (req, res) => ok(res, getSyncStatus()));

module.exports = { list, getById, iniciarSync, syncStatus };
