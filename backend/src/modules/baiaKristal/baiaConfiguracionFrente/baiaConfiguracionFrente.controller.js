const asyncHandler = require('../../../utils/asyncHandler');
const { ok } = require('../../../utils/ApiResponse');
const service = require('./baiaConfiguracionFrente.service');

const list = asyncHandler(async (req, res) => ok(res, await service.list()));

const actualizarProyecto = asyncHandler(async (req, res) => {
  const frente = decodeURIComponent(req.params.frente);
  ok(res, await service.actualizarFechaEntregaProyecto(frente, req.body.fechaEntrega));
});

const actualizarTorre = asyncHandler(async (req, res) => {
  const frente = decodeURIComponent(req.params.frente);
  const torre = decodeURIComponent(req.params.torre);
  ok(res, await service.actualizarFechaEntregaTorre(frente, torre, req.body.fechaEntrega));
});

const actualizarPiso = asyncHandler(async (req, res) => {
  const frente = decodeURIComponent(req.params.frente);
  const torre = decodeURIComponent(req.params.torre);
  const piso = decodeURIComponent(req.params.piso);
  ok(res, await service.actualizarFechaEntregaPiso(frente, torre, piso, req.body.fechaEntrega));
});

module.exports = { list, actualizarProyecto, actualizarTorre, actualizarPiso };
