// Montado en /negocios, junto a negocio.routes.js (ver routes/index.js) --
// mismo prefijo que el legado, que compartía un solo router entre Negocios
// y Dashboard/Cartera en Gestión/Resumen. Separado acá en su propio módulo
// (patrón de 5 archivos) pero con las mismas rutas URL.
const express = require('express');
const { requireAuth, requireModulo, requireAdmin } = require('../../../middlewares/auth');
const controller = require('./baiaDashboard.controller');

const router = express.Router();

router.get('/stats', requireAuth, requireModulo('negocios'), controller.stats);
router.get('/resumen-stats', requireAuth, requireModulo('resumen'), controller.resumenStats);
router.get('/dashboard-recaudo', requireAuth, requireModulo(['dashboard', 'resumen']), controller.dashboardRecaudo);
router.get('/cartera-mora', requireAuth, requireModulo('cartera-mora'), controller.carteraMora);
router.get('/resumen-etapas/meses', requireAuth, requireModulo('resumen'), controller.mesesResumen);
router.get('/resumen-etapas', requireAuth, requireModulo('resumen'), controller.resumenEtapas);
// Sin cron todavia (ver hoja de ruta) -- trigger manual para cerrar el mes
// anterior mientras tanto.
router.post('/resumen-etapas/cerrar-mes', requireAuth, requireAdmin, controller.cerrarMes);

module.exports = router;
