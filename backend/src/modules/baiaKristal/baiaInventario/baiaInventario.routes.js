// Montado en /inventario (ver routes/index.js).
const express = require('express');
const { requireAuth, requireModulo } = require('../../../middlewares/auth');
const controller = require('./baiaInventario.controller');

const router = express.Router();

// Rutas estaticas ANTES de "/:id" -- ver la regla critica de orden de rutas.
router.post('/sync', requireAuth, requireModulo('inventario'), controller.iniciarSync);
router.get('/sync/status', requireAuth, requireModulo('inventario'), controller.syncStatus);

router.get('/', requireAuth, requireModulo('inventario'), controller.list);
router.get('/:id', requireAuth, requireModulo('inventario'), controller.getById);

module.exports = router;
