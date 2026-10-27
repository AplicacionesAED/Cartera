// Montado en /configuraciones/frentes (ver routes/index.js). Lectura
// requiere sesion; escritura requiere admin (misma politica que el modulo
// legado -- fechas de entrega afectan el calculo de conciliacion de todo
// el portafolio).
const express = require('express');
const validate = require('../../../middlewares/validate');
const { requireAuth, requireAdmin } = require('../../../middlewares/auth');
const controller = require('./baiaConfiguracionFrente.controller');
const { fechaEntregaSchema } = require('./baiaConfiguracionFrente.schema');

const router = express.Router();

router.get('/', requireAuth, controller.list);

router.put('/:frente', requireAuth, requireAdmin, validate(fechaEntregaSchema, 'body'), controller.actualizarProyecto);
router.put('/:frente/torres/:torre', requireAuth, requireAdmin, validate(fechaEntregaSchema, 'body'), controller.actualizarTorre);
router.put('/:frente/torres/:torre/pisos/:piso', requireAuth, requireAdmin, validate(fechaEntregaSchema, 'body'), controller.actualizarPiso);

module.exports = router;
