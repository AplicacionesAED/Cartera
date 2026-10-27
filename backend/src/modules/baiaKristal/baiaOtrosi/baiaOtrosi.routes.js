// Montado en /otrosies (top-level, ver routes/index.js) -- vista de SOLO
// LECTURA del módulo 'Otrosíes' (Baía Kristal), alimentada por la tabla propia
// `baia_kristal_otrosies` (universo completo de Baía Kristal, ver otrosi.model.js).
// `otro_si_tiene_archivo` se puebla SOLO por backfill de GET individual
// (`otrosi.backfill.js`), nunca por sync bulk (falsos negativos en el fileupload).
// Sin POST/PUT de datos de Zoho -- la ÚNICA escritura real es el check manual
// de verificación (`PATCH /:id/verificado`, Jefe Gabriel 2026-09-24), que no
// toca ningún dato espejado del CRM, solo la auditoría propia de este módulo.
const express = require('express');
const { requireAuth, requireModulo, requireAdmin } = require('../../../middlewares/auth');
const controller = require('./baiaOtrosi.controller');

const router = express.Router();

router.post('/sync', requireAuth, requireModulo('otrosies'), controller.iniciarSync);
router.get('/sync/status', requireAuth, requireModulo('otrosies'), controller.syncStatus);
router.post('/backfill', requireAuth, requireAdmin, controller.iniciarBackfill);
router.get('/backfill/status', requireAuth, requireAdmin, controller.backfillStatus);

// Valores distintos de `stage` (ETAPA DEL NEGOCIO en Zoho) para el Select del
// filtro. No colisiona con '/:id/archivo' (1 vs 2 segmentos), se deja explícito
// el orden de lectura.
router.get('/stages', requireAuth, requireModulo('otrosies'), controller.stages);

router.get('/:id/archivo', requireAuth, requireModulo('otrosies'), controller.archivo);
router.patch('/:id/verificado', requireAuth, requireModulo('otrosies'), controller.marcarVerificado);
router.get('/', requireAuth, requireModulo('otrosies'), controller.list);

module.exports = router;