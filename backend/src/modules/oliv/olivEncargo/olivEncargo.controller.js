const asyncHandler = require('../../../utils/asyncHandler');
const { ok, created } = require('../../../utils/ApiResponse');
const ApiError = require('../../../utils/ApiError');
const service = require('./olivEncargo.service');
const { procesarArchivoOliv } = require('./olivEncargo.upload');

const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No se recibió archivo');
  const { headerRow, fecha } = req.body;
  const result = await procesarArchivoOliv(req.file.buffer, req.file.originalname, {
    headerRow: headerRow != null && headerRow !== '' ? Number(headerRow) : undefined,
    fecha: fecha || undefined,
  });
  created(res, { message: 'Archivo procesado correctamente', encargo: result.encargo, hojas: result.hojas });
});

const listEncargos = asyncHandler(async (req, res) => {
  const { search, page, limit } = req.query;
  ok(res, await service.listEncargos({ search, page, limit }));
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
  const { encargoId, propietario, hoja, search, page, limit } = req.query;
  ok(res, await service.listMovimientos({ encargoId, propietario, hoja, search, page, limit }));
});

const listPropietarios = asyncHandler(async (req, res) => {
  const { encargoId, search } = req.query;
  ok(res, await service.listPropietarios({ encargoId, search }));
});

module.exports = { upload, listEncargos, getEncargo, getHoja, updateEncargo, removeEncargo, listMovimientos, listPropietarios };
