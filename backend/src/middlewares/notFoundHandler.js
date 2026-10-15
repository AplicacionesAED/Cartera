// Va en backend/src/middlewares/notFoundHandler.js. Se monta en app.js DESPUES de las
// rutas (y del SPA fallback) y ANTES de errorHandler: una ruta que no existe responde con
// el mismo contrato JSON que cualquier otro error, no con el HTML por defecto de Express.
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` },
  });
}

module.exports = notFoundHandler;
