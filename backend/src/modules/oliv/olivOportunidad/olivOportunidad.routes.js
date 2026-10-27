// Módulo Oportunidades del proyecto Oliv (CRM HubSpot, ver
// utils/hubspotClient.js). Montado en /oliv/oportunidades (ver
// routes/index.js), protegido por el permiso dinámico 'oliv-oportunidades'
// (ver ARQUITECTURA-BACKEND.md, "Roles y permisos dinámicos").
const express = require('express');
const { requireAuth, requireModulo } = require('../../../middlewares/auth');
const controller = require('./olivOportunidad.controller');

const router = express.Router();

// Rutas estaticas ANTES de "/:id" -- ver la regla critica de orden de rutas.
router.post('/sync', requireAuth, requireModulo('oliv-oportunidades'), controller.iniciarSync);
router.get('/sync/status', requireAuth, requireModulo('oliv-oportunidades'), controller.syncStatus);
router.get('/status', requireAuth, requireModulo('oliv-oportunidades'), controller.status);
router.get('/stages', requireAuth, requireModulo('oliv-oportunidades'), controller.stages);
router.get('/propiedades/metadata', requireAuth, requireModulo('oliv-oportunidades'), controller.propiedadesMetadata);

router.get('/', requireAuth, requireModulo('oliv-oportunidades'), controller.list);
router.get('/:id', requireAuth, requireModulo('oliv-oportunidades'), controller.getById);

module.exports = router;
