const asyncHandler = require('../../../utils/asyncHandler');
const { ok, created } = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');
const service = require('./baiaFiducia.service');
const { procesarArchivoFiducia } = require('./baiaFiducia.upload');

const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No se recibió archivo');
  const { nombre, codigo, emailId, emailAsunto, emailFecha } = req.body;
  const result = await procesarArchivoFiducia(req.file.buffer, req.file.originalname, {
    nombre: nombre || undefined,
    codigo: codigo || undefined,
    emailId: emailId || undefined,
    emailAsunto: emailAsunto || undefined,
    emailFecha: emailFecha || undefined,
  });

  if (result.skipped) {
    return ok(res, { message: 'Archivo ya importado anteriormente, omitido', encargo: result.encargo });
  }
  created(res, { message: 'Archivo procesado correctamente', encargo: result.encargo, hojas: result.hojas });
});

const listEncargos = asyncHandler(async (req, res) => {
  const { search, proyecto, page, limit } = req.query;
  ok(res, await service.listEncargos({ search, proyecto, page, limit }));
});

const getEncargo = asyncHandler(async (req, res) => ok(res, await service.getEncargo(req.params.id)));

const getHoja = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  ok(res, await service.getHoja(req.params.id, req.params.hojaId, { page, limit }));
});

const updateEncargo = asyncHandler(async (req, res) => ok(res, await service.updateEncargo(req.params.id, req.body)));

const removeEncargo = asyncHandler(async (req, res) => {
  await service.removeEncargo(req.params.id);
  ok(res, { message: 'Eliminado' });
});

const listMovimientos = asyncHandler(async (req, res) => {
  const { encargId, codigo, propietario, hoja, search, page, limit, fechaDesde, fechaHasta, sortField, sortDir } = req.query;
  ok(res, await service.listMovimientos({ encargId, codigo, propietario, hoja, search, page, limit, fechaDesde, fechaHasta, sortField, sortDir }));
});

const listPropietarios = asyncHandler(async (req, res) => {
  const { encargId, search } = req.query;
  ok(res, await service.listPropietarios({ encargId, search }));
});

const listNomenclaturas = asyncHandler(async (req, res) => {
  const { search, page, limit } = req.query;
  ok(res, await service.listNomenclaturas(req.params.id, { search, page, limit }));
});

const getApartamentoDetalle = asyncHandler(async (req, res) => {
  const referencia = decodeURIComponent(req.params.referencia);
  ok(res, await service.getApartamentoDetalle(req.params.id, referencia));
});

module.exports = { upload, listEncargos, getEncargo, getHoja, updateEncargo, removeEncargo, listMovimientos, listPropietarios, listNomenclaturas, getApartamentoDetalle };
