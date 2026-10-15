// Va en backend/src/utils/ApiResponse.js. Un solo formato de exito en todo el API:
// { success: true, data, meta? }. Nunca armes esto a mano en un controller.
// Las descargas de archivos (buffer/stream) son la unica excepcion: responden el
// binario directo con res.send()/pipe() y sus propios headers.
function ok(res, data, meta) {
  return res.status(200).json(meta ? { success: true, data, meta } : { success: true, data });
}

function created(res, data) {
  return res.status(201).json({ success: true, data });
}

function noContent(res) {
  return res.status(204).end();
}

module.exports = { ok, created, noContent };
