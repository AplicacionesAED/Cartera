// Va en backend/src/utils/ApiError.js. Se LANZA desde service/controller
// (`throw new ApiError(404, 'No encontrado')`); middlewares/errorHandler.js es el
// unico lugar que lo convierte en respuesta HTTP.
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = ApiError;
