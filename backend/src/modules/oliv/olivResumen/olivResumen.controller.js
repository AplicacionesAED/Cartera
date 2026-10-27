const asyncHandler = require('../../../utils/asyncHandler');
const { ok } = require('../../../utils/ApiResponse');
const service = require('./olivResumen.service');

const dashboardRecaudo = asyncHandler(async (req, res) => {
  const { search, torre, estadoInmueble, conMovimientos, sortBy, sortDir, page, limit } = req.query;
  ok(res, await service.obtenerDashboardRecaudo({
    search, torre, estadoInmueble, conMovimientos, sortBy, sortDir,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  }));
});

const resumenStats = asyncHandler(async (req, res) => ok(res, await service.obtenerResumenStats()));

const carteraMora = asyncHandler(async (req, res) => {
  const { search, torre, estadoInmueble, rango, vista, sortBy, sortDir, page, limit } = req.query;
  ok(res, await service.obtenerCarteraMora({
    search, torre, estadoInmueble, rango, vista, sortBy, sortDir,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  }));
});

const mesesResumen = asyncHandler(async (req, res) => ok(res, await service.obtenerMesesDisponiblesResumen()));

const resumenTorres = asyncHandler(async (req, res) => ok(res, await service.obtenerResumenCarteraMes(req.query.mes)));

// Solo admin -- mismo criterio que cerrarMesAnteriorSiFalta de Baía Kristal
// (sin cron todavía, trigger manual mientras tanto).
const cerrarMes = asyncHandler(async (req, res) => {
  const fila = await service.cerrarMesAnteriorSiFalta();
  ok(res, { message: fila ? 'Mes cerrado correctamente' : 'El mes anterior ya estaba cerrado', fila });
});

module.exports = { dashboardRecaudo, resumenStats, mesesResumen, resumenTorres, cerrarMes, carteraMora };
