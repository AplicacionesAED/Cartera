// Montado en /vinculos. Solo requiere sesión: cada vínculo ya se filtra por el
// permiso del módulo destino dentro del servicio.
const express = require('express');
const { requireAuth } = require('../../../middlewares/auth');
const controller = require('./baiaVinculo.controller');

const router = express.Router();

router.get('/:proyecto/:tipo/:id', requireAuth, controller.obtener);

module.exports = router;
