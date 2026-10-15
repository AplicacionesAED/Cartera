// Va en backend/src/middlewares/validate.js.
const ApiError = require('../utils/ApiError');

// Valida req[source] (body/params/query) contra un schema zod, y REEMPLAZA
// req[source] por el resultado parseado (aplica los defaults/transforms del
// schema en vez de dejar el objeto crudo del request).
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new ApiError(422, 'Datos inválidos', result.error.flatten()));
    }
    req[source] = result.data;
    next();
  };
}

module.exports = validate;
