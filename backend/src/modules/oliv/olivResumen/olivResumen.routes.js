// Montado en /oliv/resumen (ver routes/index.js). "Resumen Gerencial" de
// Oliv -- equivalente a dashboard.routes.js de Baía Kristal, mismas rutas
// pero renombradas de "-etapas" a "-torres" (Oliv agrupa por Torre, no por
// Etapa constructiva -- ver el comentario de cabecera de olivResumen.service.js).
const express = require('express');
const { requireAuth, requireModulo, requireAdmin } = require('../../../middlewares/auth');
const controller = require('./olivResumen.controller');

const router = express.Router();

router.get('/resumen-stats', requireAuth, requireModulo('oliv-resumen'), controller.resumenStats);
// Compartido por Resumen y por el Dashboard de drill-down -- cualquiera de
// los dos permisos alcanza (mismo criterio que dashboard.routes.js de Baía
// Kristal: `requireModulo(['dashboard', 'resumen'])`).
router.get('/dashboard-recaudo', requireAuth, requireModulo(['oliv-resumen', 'oliv-dashboard']), controller.dashboardRecaudo);
router.get('/cartera-mora', requireAuth, requireModulo('oliv-cartera-mora'), controller.carteraMora);
router.get('/resumen-torres/meses', requireAuth, requireModulo('oliv-resumen'), controller.mesesResumen);
router.get('/resumen-torres', requireAuth, requireModulo('oliv-resumen'), controller.resumenTorres);
// Sin cron todavia (mismo criterio que Baía Kristal) -- trigger manual para
// cerrar el mes anterior mientras tanto.
router.post('/resumen-torres/cerrar-mes', requireAuth, requireAdmin, controller.cerrarMes);

module.exports = router;
