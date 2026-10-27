// Precalentado de los caches de cartera (Baía Kristal y Oliv).
//
// El cálculo de conciliación por inmueble tarda ~20 s y vive en MEMORIA del
// proceso (dashboardCache.js / olivResumenCache.js). Sin precalentar, el primer
// usuario después de cada reinicio/deploy -- y después de cada sync, upload o
// cambio de configuración que invalide el cache -- espera ese cálculo completo
// (y Inicio, que es la primera pantalla, lo hace muy visible).
//   - Al arrancar el servidor (server.js) se calientan los dos.
//   - Cada vez que algo invalida un cache se reconstruye solo, con un debounce de
//     15 s (dashboardCache.js / olivResumenCache.js).
// Es seguro: si falla, solo se registra y el primer request lo reconstruye como
// siempre. Se desactiva con PRECALENTAR_CACHE=false.
async function ejecutar(nombre, cargar) {
  const t0 = Date.now();
  try {
    await cargar().precalentarCache();
    console.log(`[precalentar] ${nombre} listo en ${Math.round((Date.now() - t0) / 1000)} s`); // eslint-disable-line no-console
  } catch (err) {
    console.error(`[precalentar] ${nombre} falló (se reconstruirá en la primera consulta):`, err.message); // eslint-disable-line no-console
  }
}

const precalentarBaiaKristal = () => ejecutar('Baía Kristal', () => require('./baiaKristal/baiaDashboard/baiaDashboard.service'));
const precalentarOliv = () => ejecutar('Oliv', () => require('./oliv/olivResumen/olivResumen.service'));

// Uno tras otro (no en paralelo) para no duplicar el pico de CPU/BD al arrancar.
async function precalentarTodo() {
  if (process.env.PRECALENTAR_CACHE === 'false') return;
  await precalentarBaiaKristal();
  await precalentarOliv();
}

module.exports = { precalentarBaiaKristal, precalentarOliv, precalentarTodo };
