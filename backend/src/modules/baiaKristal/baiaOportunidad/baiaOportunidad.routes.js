// Montado en /oportunidades (ver routes/index.js). Traduce
// zoho-payment-tracker's /api/opportunities -- mismo patron de nombres en
// español que /inventario, /configuraciones/frentes.
const express = require('express');
const { requireAuth, requireModulo } = require('../../../middlewares/auth');
const controller = require('./baiaOportunidad.controller');

const router = express.Router();

// Rutas estaticas ANTES de "/:id" -- ver la regla critica de orden de rutas.
router.post('/sync', requireAuth, requireModulo('oportunidades'), controller.iniciarSync);
router.get('/sync/status', requireAuth, requireModulo('oportunidades'), controller.syncStatus);
router.get('/sync/logs', requireAuth, requireModulo(['oportunidades', 'resumen']), controller.syncLogs);
router.post('/backfill-subforms', requireAuth, requireModulo('oportunidades'), controller.iniciarBackfill);
router.get('/backfill-subforms/status', requireAuth, requireModulo('oportunidades'), controller.backfillStatus);
router.get('/stages', requireAuth, requireModulo('oportunidades'), controller.stages);
router.get('/campos/metadata', requireAuth, requireModulo(['oportunidades', 'negocios']), controller.camposMetadata);

router.get('/', requireAuth, requireModulo('oportunidades'), controller.list);
router.get('/:id', requireAuth, requireModulo('oportunidades'), controller.getById);
router.post('/:id/subforms/refrescar', requireAuth, requireModulo(['oportunidades', 'negocios']), controller.refrescarSubforms);
router.get('/:id/subforms', requireAuth, requireModulo(['oportunidades', 'negocios']), controller.getSubforms);

module.exports = router;
