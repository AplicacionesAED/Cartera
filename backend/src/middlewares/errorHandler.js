// Va en backend/src/middlewares/errorHandler.js. Es el UNICO lugar que formatea errores y
// es IDENTICO en todos los proyectos de la familia aed.
//
// Contrato (lo que el frontend lee): { success: false, error: { message, details? } }
//
// Traduce a respuesta HTTP, en este orden:
//   ApiError                      -> su statusCode, message y details tal cual
//   JSON mal formado en el body   -> 400   (antes caia a un 500 generico)
//   Body demasiado grande         -> 413
//   MulterError                   -> 400   (archivo demasiado grande, campo inesperado)
//   Sequelize Unique              -> 409
//   Sequelize ForeignKey          -> 409
//   Sequelize Validation          -> 422   (details: lista de mensajes)
//   Postgres crudo 23505 / 23503  -> 409 / 409   (SQL escrito a mano sin pasar por Sequelize)
//   Postgres 22P02 / 22007 / 22008 / 22003 -> 400 (un :id o fecha con formato invalido)
//   Base de datos inalcanzable    -> 503 + Retry-After (el frontend muestra "intenta de nuevo")
//   cualquier otro                -> 500 sin filtrar detalles internos (fuera de produccion
//                                    se agrega el mensaje real en details, para depurar)
//
// Una respuesta que YA empezo a enviarse (un stream de archivo que falla a la mitad) no se
// puede reformatear: se delega a Express, que corta la conexion.
const ApiError = require('../utils/ApiError');

const ERRORES_DE_CONEXION = new Set([
  'SequelizeConnectionError',
  'SequelizeConnectionRefusedError',
  'SequelizeConnectionTimedOutError',
  'SequelizeHostNotFoundError',
  'SequelizeHostNotReachableError',
  'SequelizeConnectionAcquireTimeoutError',
]);

// Codigos de error de Postgres que significan "el cliente mando un valor con mal formato".
const CODIGOS_PG_FORMATO_INVALIDO = new Set(['22P02', '22007', '22008', '22003']);

function responder(res, status, message, details) {
  const error = { message };
  if (details !== undefined && details !== null) error.details = details;
  return res.status(status).json({ success: false, error });
}

function mensajesDe(err) {
  const lista = err.errors?.map((e) => e.message).filter(Boolean);
  return lista?.length ? lista : undefined;
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) return responder(res, err.statusCode, err.message, err.details);

  // body-parser (express.json) -- el cliente mando algo que no es JSON valido o es enorme.
  if (err.type === 'entity.parse.failed') return responder(res, 400, 'El cuerpo de la petición no es un JSON válido');
  if (err.type === 'entity.too.large') return responder(res, 413, 'El cuerpo de la petición es demasiado grande');

  if (err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo permitido' : err.message;
    return responder(res, 400, message);
  }

  if (err.name === 'SequelizeUniqueConstraintError' || err.code === '23505') {
    return responder(res, 409, 'Ya existe un registro con ese valor', mensajesDe(err));
  }
  if (err.name === 'SequelizeForeignKeyConstraintError' || err.code === '23503') {
    return responder(res, 409, 'La operación viola una relación con otro registro');
  }
  if (err.name === 'SequelizeValidationError') {
    return responder(res, 422, 'Datos inválidos', mensajesDe(err));
  }
  if (CODIGOS_PG_FORMATO_INVALIDO.has(err.code ?? err.parent?.code)) {
    return responder(res, 400, 'Uno de los valores enviados tiene un formato inválido');
  }

  if (ERRORES_DE_CONEXION.has(err.name)) {
    console.error(`[db] ${err.name}: ${err.message}`); // eslint-disable-line no-console
    res.set('Retry-After', '5');
    return responder(res, 503, 'El servidor está ocupado en este momento. Intenta de nuevo en unos segundos.');
  }

  // Error no previsto: se registra con contexto (quien, que ruta) y NUNCA se devuelve el
  // detalle al cliente en produccion.
  console.error('[error]', { metodo: req.method, ruta: req.originalUrl, usuario: req.usuario?.id ?? null }, err); // eslint-disable-line no-console
  const detalleDev = process.env.NODE_ENV === 'production' ? undefined : err.message;
  return responder(res, 500, 'Error interno del servidor', detalleDev);
}

module.exports = errorHandler;
