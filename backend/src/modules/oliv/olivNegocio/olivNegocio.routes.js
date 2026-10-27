// Módulo Negocios del proyecto Oliv -- vista compuesta sobre OlivOportunidad
// + OlivInmueble + la cotización aceptada (ver olivNegocio.service.js para
// el detalle completo). Montado en /oliv/negocios (ver routes/index.js),
// protegido por el permiso dinámico 'oliv-negocios'.
const express = require('express');
const { requireAuth, requireModulo } = require('../../../middlewares/auth');
const controller = require('./olivNegocio.controller');

const router = express.Router();

router.get('/', requireAuth, requireModulo('oliv-negocios'), controller.list);
router.get('/:id', requireAuth, requireModulo('oliv-negocios'), controller.getById);

module.exports = router;
