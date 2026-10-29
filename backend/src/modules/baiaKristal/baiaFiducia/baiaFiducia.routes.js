// Montado en /fiducia (ver routes/index.js).
const express = require('express');
const multer = require('multer');
const { requireAuth, requireModulo, requireAuthOIntegracion } = require('../../../middlewares/auth');
const controller = require('./baiaFiducia.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Subida de archivos: sesión de usuario con el módulo `encargos` O la llave de integración de n8n (X-API-Key).
router.post('/upload', requireAuthOIntegracion('encargos'), upload.single('archivo'), controller.upload);

router.get('/encargos', requireAuth, requireModulo(['encargos', 'oportunidades']), controller.listEncargos);
router.get('/encargos/:id', requireAuth, requireModulo('encargos'), controller.getEncargo);
router.get('/encargos/:id/hojas/:hojaId', requireAuth, requireModulo('encargos'), controller.getHoja);
router.get('/encargos/:id/nomenclaturas', requireAuth, requireModulo('encargos'), controller.listNomenclaturas);
router.get('/encargos/:id/negocio/:referencia', requireAuth, requireModulo('encargos'), controller.getApartamentoDetalle);
router.patch('/encargos/:id', requireAuth, requireModulo('encargos'), controller.updateEncargo);
router.delete('/encargos/:id', requireAuth, requireModulo('encargos'), controller.removeEncargo);

module.exports = router;
