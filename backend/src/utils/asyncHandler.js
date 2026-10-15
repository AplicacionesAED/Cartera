// Va en backend/src/utils/asyncHandler.js. Envuelve un controller async para que
// cualquier error (throw o promesa rechazada) llegue a errorHandler via next().
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
