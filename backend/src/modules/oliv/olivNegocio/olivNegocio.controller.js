const asyncHandler = require('../../../utils/asyncHandler');
const { ok } = require('../../../utils/ApiResponse');
const service = require('./olivNegocio.service');

const list = asyncHandler(async (req, res) => {
  const { search, estado, torre, estadoInmueble, page, limit } = req.query;
  ok(res, await service.list({ search, estado, torre, estadoInmueble, page, limit }));
});

const getById = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));

module.exports = { list, getById };
