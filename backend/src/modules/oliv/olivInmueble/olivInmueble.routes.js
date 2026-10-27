// Módulo Inmuebles del proyecto Oliv (objeto personalizado "Unidades" de
// HubSpot). Montado en /oliv/inmuebles (ver routes/index.js), protegido por
// el permiso dinámico 'oliv-inmuebles'.
const express = require('express');
const { requireAuth, requireModulo } = require('../../../middlewares/auth');
const controller = require('./olivInmueble.controller');

const router = express.Router();

// Rutas estaticas ANTES de "/:id" -- ver la regla critica de orden de rutas.
router.post('/sync', requireAuth, requireModulo('oliv-inmuebles'), controller.iniciarSync);
router.get('/sync/status', requireAuth, requireModulo('oliv-inmuebles'), controller.syncStatus);

router.get('/', requireAuth, requireModulo('oliv-inmuebles'), controller.list);
router.get('/:id', requireAuth, requireModulo('oliv-inmuebles'), controller.getById);

module.exports = router;
