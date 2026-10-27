// Cache en memoria del cálculo pesado del Resumen de Oliv (cotización +
// conciliación por cada Inmueble del portafolio) -- mismo patrón y mismo
// motivo que `dashboard/dashboardCache.js` (Baía Kristal): archivo propio
// para que los módulos que invalidan el cache (olivEncargo.upload.js,
// olivOportunidad.sync.js, olivInmueble.sync.js) puedan importar solo esto
// sin crear un require circular con olivResumen.service.js.
let cache = null; // { filas, torres, builtAt }
let cacheEnConstruccion = null;

function getCache() {
  return cache;
}

function getEnConstruccion() {
  return cacheEnConstruccion;
}

function setCache(valor) {
  cache = valor;
}

function setEnConstruccion(promesa) {
  cacheEnConstruccion = promesa;
}

// Mismo precalentado en segundo plano que dashboardCache.js (ver precalentar.js).
let timerPrecalentar = null;
const ESPERA_PRECALENTAR_MS = 15000;

function invalidarCacheResumenOliv() {
  cache = null;
  cacheEnConstruccion = null;
  if (process.env.PRECALENTAR_CACHE === 'false') return;
  clearTimeout(timerPrecalentar);
  timerPrecalentar = setTimeout(() => {
    require('../../precalentar').precalentarOliv();
  }, ESPERA_PRECALENTAR_MS);
  timerPrecalentar.unref?.();
}

module.exports = { getCache, getEnConstruccion, setCache, setEnConstruccion, invalidarCacheResumenOliv };
