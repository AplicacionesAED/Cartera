const asyncHandler = require('../../../utils/asyncHandler');
const { ok } = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');
const service = require('./baiaDashboard.service');

const stats = asyncHandler(async (req, res) => ok(res, await service.obtenerStats()));

const resumenStats = asyncHandler(async (req, res) => ok(res, await service.obtenerResumenStats()));

const dashboardRecaudo = asyncHandler(async (req, res) => {
  const { search, etapa, frente, torre, conMovimientos, sortBy, sortDir, page = '1', limit = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(9999, Math.max(1, parseInt(limit, 10)));
  ok(res, await service.obtenerDashboardRecaudo({ search, etapa, frente, torre, conMovimientos, sortBy, sortDir, page: pageNum, limit: limitNum }));
});

const carteraMora = asyncHandler(async (req, res) => {
  const { search, etapa, frente, torre, rango, vista, tramite, sortBy, sortDir, page = '1', limit = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(9999, Math.max(1, parseInt(limit, 10)));
  ok(res, await service.obtenerCarteraMora({ search, etapa, frente, torre, rango, vista, tramite, sortBy, sortDir, page: pageNum, limit: limitNum }));
});

const mesesResumen = asyncHandler(async (req, res) => ok(res, await service.obtenerMesesDisponiblesResumen()));

const resumenEtapas = asyncHandler(async (req, res) => {
  const resultado = await service.obtenerResumenCarteraMes(req.query.mes);
  if (!resultado) throw new ApiError(404, 'No hay datos guardados para ese mes');
  ok(res, resultado);
});

const cerrarMes = asyncHandler(async (req, res) => ok(res, (await service.cerrarMesAnteriorSiFalta()) ?? { message: 'El mes anterior ya tenía una foto guardada' }));

module.exports = { stats, resumenStats, dashboardRecaudo, carteraMora, mesesResumen, resumenEtapas, cerrarMes };
