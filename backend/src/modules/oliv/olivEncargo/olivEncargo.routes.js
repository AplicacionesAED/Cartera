// Montado en /oliv/encargos (ver routes/index.js). Rutas estáticas
// (/movimientos, /propietarios) ANTES del catch-all "/:id" -- si se
// registran después, Express interpreta "movimientos" como el :id (misma
// regla de orden de rutas que dashboardRoutes/negocioRoutes, ver
// ARQUITECTURA-BACKEND.md).
const express = require('express');
const multer = require('multer');
const { requireAuth, requireModulo } = require('../../../middlewares/auth');
const controller = require('./olivEncargo.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/upload', requireAuth, requireModulo('oliv-encargos'), upload.single('archivo'), controller.upload);

router.get('/movimientos', requireAuth, requireModulo('oliv-movimientos'), controller.listMovimientos);
router.get('/propietarios', requireAuth, requireModulo('oliv-movimientos'), controller.listPropietarios);

router.get('/', requireAuth, requireModulo('oliv-encargos'), controller.listEncargos);
router.get('/:id', requireAuth, requireModulo('oliv-encargos'), controller.getEncargo);
router.get('/:id/hojas/:hojaId', requireAuth, requireModulo('oliv-encargos'), controller.getHoja);
router.patch('/:id', requireAuth, requireModulo('oliv-encargos'), controller.updateEncargo);
router.delete('/:id', requireAuth, requireModulo('oliv-encargos'), controller.removeEncargo);

module.exports = router;
