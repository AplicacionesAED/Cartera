// Montado en /negocios (ver routes/index.js). Los endpoints de Dashboard
// Plan vs. Recaudo / Cartera en Gestión / Resumen Gerencial que en el
// legado compartían este mismo router (/dashboard-recaudo, /cartera-mora,
// /stats, /resumen-etapas*) se portan en esa fase, no acá.
const express = require('express');
const { requireAuth, requireModulo } = require('../../middlewares/auth');
const controller = require('./negocio.controller');

const router = express.Router();

// Rutas estaticas ANTES de "/:id" -- ver la regla critica de orden de rutas.
router.post('/backfill', requireAuth, requireModulo('negocios'), controller.iniciarBackfill);
router.get('/backfill/status', requireAuth, requireModulo('negocios'), controller.backfillStatus);

router.get('/', requireAuth, requireModulo('negocios'), controller.list);
// Rutas estaticas de un solo segmento -- deben ir ANTES de "/:id", si no
// Express las matchea contra el catch-all (mismo motivo que /backfill arriba).
router.get('/movimientos', requireAuth, requireModulo('movimientos'), controller.listMovimientos);
router.get('/movimientos/export', requireAuth, requireModulo('movimientos'), controller.exportMovimientos);
router.patch('/:negocioId/flags', requireAuth, requireModulo('cartera-mora'), controller.updateFlags);
router.get('/:id/movimientos', requireAuth, requireModulo('negocios'), controller.getMovimientos);
router.get('/:id', requireAuth, requireModulo('negocios'), controller.getById);

module.exports = router;
