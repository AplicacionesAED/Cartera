// Unico lugar que mapea rutas URL a routers de modulo.
const express = require('express');
const usuarioRoutes = require('../modules/usuario/usuario.routes');
const rolRoutes = require('../modules/rol/rol.routes');
const authRoutes = require('../modules/auth/auth.routes');
const configuracionFrenteRoutes = require('../modules/baiaKristal/baiaConfiguracionFrente/baiaConfiguracionFrente.routes');
const inventarioRoutes = require('../modules/baiaKristal/baiaInventario/baiaInventario.routes');
const oportunidadRoutes = require('../modules/baiaKristal/baiaOportunidad/baiaOportunidad.routes');
const otrosiRoutes = require('../modules/baiaKristal/baiaOtrosi/baiaOtrosi.routes');
const fiduciaRoutes = require('../modules/baiaKristal/baiaFiducia/baiaFiducia.routes');
const negocioRoutes = require('../modules/baiaKristal/baiaNegocio/baiaNegocio.routes');
const dashboardRoutes = require('../modules/baiaKristal/baiaDashboard/baiaDashboard.routes');
const olivOportunidadRoutes = require('../modules/oliv/olivOportunidad/olivOportunidad.routes');
const olivInmuebleRoutes = require('../modules/oliv/olivInmueble/olivInmueble.routes');
const olivNegocioRoutes = require('../modules/oliv/olivNegocio/olivNegocio.routes');
const olivEncargoRoutes = require('../modules/oliv/olivEncargo/olivEncargo.routes');
const olivResumenRoutes = require('../modules/oliv/olivResumen/olivResumen.routes');
const inicioRoutes = require('../modules/inicio/inicio.routes');
const vinculoRoutes = require('../modules/baiaKristal/baiaVinculo/baiaVinculo.routes');
const syncRoutes = require('../modules/sync/sync.routes');

const router = express.Router();

router.use('/usuarios', usuarioRoutes);
router.use('/roles', rolRoutes);
router.use('/auth', authRoutes);
router.use('/configuraciones/frentes', configuracionFrenteRoutes);
router.use('/inventario', inventarioRoutes);
router.use('/oportunidades', oportunidadRoutes);
router.use('/otrosies', otrosiRoutes);
router.use('/fiducia', fiduciaRoutes);
// dashboardRoutes ANTES que negocioRoutes -- negocioRoutes tiene un
// catch-all "/:id" que, si se monta primero, intercepta rutas estaticas
// como "/stats"/"/dashboard-recaudo" como si fueran un id (ver la regla de
// orden de rutas en ARQUITECTURA-BACKEND.md, acá aplicada entre routers
// distintos montados en el mismo prefijo, no solo dentro de un router).
router.use('/negocios', dashboardRoutes);
router.use('/negocios', negocioRoutes);
router.use('/oliv/oportunidades', olivOportunidadRoutes);
router.use('/oliv/inmuebles', olivInmuebleRoutes);
router.use('/oliv/negocios', olivNegocioRoutes);
router.use('/oliv/encargos', olivEncargoRoutes);
router.use('/oliv/resumen', olivResumenRoutes);
router.use('/inicio', inicioRoutes);
router.use('/vinculos', vinculoRoutes);
router.use('/sync', syncRoutes);

router.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

module.exports = router;
