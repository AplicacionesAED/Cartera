const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const routes = require('./routes/index');
const errorHandler = require('./middlewares/errorHandler');
const notFoundHandler = require('./middlewares/notFoundHandler');
const requestLogger = require('./middlewares/requestLogger');

const app = express();

// CORS_ORIGIN acepta varios origenes separados por coma (ej. el dominio real
// y la IP de la red local). `credentials: true` es obligatorio para que las
// cookies de sesion viajen en cada request.
const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
// exposedHeaders: sin esto el navegador no deja leer Content-Disposition desde JS entre origenes distintos.
app.use(cors({ origin: corsOrigins, credentials: true, exposedHeaders: ['Content-Disposition'] }));
app.use(cookieParser());
app.use(express.json());
app.use(requestLogger);

// Toda la API vive bajo /api (varias rutas coinciden exactamente con una
// pagina del frontend, ej. /negocios/:id -- sin el prefijo, un refresh del
// navegador le pegaria al JSON en vez de servir la SPA).
app.use('/api', routes);

// En produccion (contenedor Docker) este mismo proceso sirve tambien el build
// estatico del frontend (Vite `dist/`) -- un solo proceso, sin nginx aparte,
// igual que HRMS. En desarrollo el frontend corre suelto con `vite dev` y
// esta carpeta no existe, asi que este bloque no hace nada.
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
