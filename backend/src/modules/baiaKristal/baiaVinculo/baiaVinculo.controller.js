const asyncHandler = require('../../../utils/asyncHandler');
const { ok } = require('../../../utils/ApiResponse');
const service = require('./baiaVinculo.service');

const obtener = asyncHandler(async (req, res) => {
  const { proyecto, tipo, id } = req.params;
  ok(res, await service.obtener({ proyecto, tipo, id }, req.usuario));
});

module.exports = { obtener };
