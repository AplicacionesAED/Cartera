// Cancelación de sincronizaciones largas. La tarea no se corta de golpe: se marca la petición y la tarea se detiene
// sola en su siguiente punto seguro (ver utils/progresoSync.js), conservando lo ya guardado.
// Se exige el mismo módulo que da permiso para iniciar esa sincronización.
const express = require('express');
const { requireAuth, requireModulo, requireAdmin } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/ApiResponse');
const { progresoSync } = require('../../utils/progresoSync');

const router = express.Router();

// clave de la tarea -> permiso requerido (null = solo administradores, como su botón de inicio)
const TAREAS = {
  oportunidades: 'oportunidades',
  inventario: 'inventario',
  otrosies: 'otrosies',
  'oliv-oportunidades': 'oliv-oportunidades',
  'oliv-inmuebles': 'oliv-inmuebles',
  subforms: 'oportunidades',
};

router.post(
  '/cancelar/:clave',
  requireAuth,
  (req, res, next) => {
    const clave = req.params.clave;
    if (!(clave in TAREAS)) return next(new ApiError(404, 'Sincronización desconocida'));
    return (TAREAS[clave] === null ? requireAdmin : requireModulo(TAREAS[clave]))(req, res, next);
  },
  asyncHandler(async (req, res) => {
    const aceptado = progresoSync(req.params.clave).cancelar();
    ok(res, { cancelando: aceptado, message: aceptado ? 'Cancelando: se detendrá en el siguiente punto seguro y conservará lo ya guardado' : 'No hay una sincronización en curso que se pueda cancelar' });
  })
);

module.exports = router;
