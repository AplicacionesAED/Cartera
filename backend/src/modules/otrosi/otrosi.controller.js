const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/ApiResponse');
const service = require('./otrosi.service');
const { syncOtrosiesFromZoho, getOtrosiSyncStatus } = require('./otrosi.sync');
const { runOtrosiBackfill, isOtrosiBackfillRunning, getOtrosiBackfillResult } = require('./otrosi.backfill');

const list = asyncHandler(async (req, res) => {
  const { search, requerido, stage, sortBy, sortDir, etapa, frente, torre, verificado, page, limit } = req.query;
  ok(res, await service.listOtrosi({ search, requerido, stage, sortBy, sortDir, etapa, frente, torre, verificado, page, limit }));
});

// Check manual de verificación (Jefe Gabriel, 2026-09-24) -- `usuarioId`
// SIEMPRE sale de la sesión (`req.usuario.id`), nunca del body, para que la
// auditoría de quién verificó sea confiable.
const marcarVerificado = asyncHandler(async (req, res) => {
  const valor = req.body?.verificado !== false;
  ok(res, await service.marcarVerificado(req.params.id, req.usuario.id, valor));
});

const stages = asyncHandler(async (req, res) => ok(res, await service.listStages()));

const iniciarSync = asyncHandler(async (req, res) => {
  if (getOtrosiSyncStatus().status === 'running') {
    return ok(res, { message: 'Sincronización de Otrosíes ya en ejecución', running: true });
  }
  ok(res, { message: 'Sincronización iniciada' });
  syncOtrosiesFromZoho().catch((err) => console.error('[otrosies] Error en sync manual:', err.message)); // eslint-disable-line no-console
});

const syncStatus = asyncHandler(async (req, res) => ok(res, getOtrosiSyncStatus()));

const iniciarBackfill = asyncHandler(async (req, res) => {
  if (isOtrosiBackfillRunning()) {
    return ok(res, { message: 'Backfill de Otrosíes ya en ejecución', running: true });
  }
  const force = req.query.full === 'true';
  ok(res, { message: 'Backfill de Otrosíes iniciado en segundo plano', running: true });
  runOtrosiBackfill(force);
});

const backfillStatus = asyncHandler(async (req, res) => ok(res, { running: isOtrosiBackfillRunning(), result: getOtrosiBackfillResult() }));

// Streaming directo del PDF hacia el navegador, sin guardar nada en BD/disco.
// El PDF debe ABRIRSE en el visor del navegador, no descargarse (Jefe Gabriel)
// -- se fuerza `Content-Disposition: inline` aunque Zoho entregue `attachment`
// (que es justo lo que pasaba antes: se reenviaba el header de Zoho tal cual y
// el navegador descargaba el archivo). Se corta el stream de Zoho si el
// cliente aborta (res close).
const archivo = asyncHandler(async (req, res, next) => {
  const { stream, contentType, contentLength, fileName } = await service.getArchivo(req.params.id);

  res.setHeader('Content-Type', contentType);
  if (contentLength) res.setHeader('Content-Length', contentLength);
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  res.on('close', () => {
    if (!res.writableEnded) stream.destroy();
  });
  stream.on('error', () => {
    // Antes se armaba { success:false, message } a mano (el mensaje fuera de `error`): rompia el
    // contrato. Si aun no se mando nada, el errorHandler formatea el 502 estandar; si ya se mando
    // parte del PDF no hay respuesta que formatear, solo cortar la conexion.
    if (!res.headersSent) return next(new ApiError(502, 'Error al transmitir el archivo desde Zoho'));
    res.destroy();
  });
  stream.pipe(res);
});

module.exports = { list, stages, iniciarSync, syncStatus, iniciarBackfill, backfillStatus, archivo, marcarVerificado };