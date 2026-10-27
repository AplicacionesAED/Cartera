// Programador diario de las sincronizaciones (antes eran botones que alguien tenía que pulsar).
//
// DOS corridas al día (hora de Bogotá):
//
//  A. SINCRONIZACIÓN COMPLETA, a las AUTO_SYNC_HORA_COMPLETA (por defecto 04:00): "Sincronizar todo" en Baía Kristal
//     (Inventario + todas las Oportunidades de Zoho con su información y TODOS los planes de pago, limpiando lo que
//     ya no cumple la regla) y en Oliv (todas las Oportunidades e Inmuebles de HubSpot). Es la red de seguridad: deja
//     todo al día aunque un cambio no se haya detectado en las sincronizaciones por cambios.
//
//  B. SINCRONIZACIÓN DEL DÍA, a las AUTO_SYNC_HORA (por defecto 12:30: los Excel de la fiducia llegan hacia las
//     12:00), en este orden:
//   1. Zoho: Inventario y Oportunidades por cambios (Baía Kristal)
//   2. HubSpot: Oportunidades e Inmuebles por cambios (Oliv)
//   3. Reconstruir Negocios desde los encargos de la fiducia (Baía Kristal) -- lo que alimenta
//      Dashboard, Resumen, Negocios y Estado de cuenta
//   4. Cerrar el mes anterior si todavía no tiene foto (Baía Kristal y Oliv; no hace nada si ya existe)
// Cada paso es independiente: si uno falla se registra y se sigue con el siguiente. Los botones
// manuales siguen funcionando (cada sync ya evita correr dos veces a la vez).
// Vive en el proceso del servidor (un solo contenedor): sin dependencias nuevas. Si el servidor
// está apagado a esa hora, ese día no corre (no se recupera solo al volver a arrancar, para que un
// despliegue a media tarde no dispare todo de nuevo). AUTO_SYNC=false lo desactiva.
const DEFAULT_HORA = '12:30';
const DEFAULT_HORA_COMPLETA = '04:00';
const ZONA = 'America/Bogota';

let ultimoDiaEjecutado = null;
let ultimoDiaCompleta = null;
let ejecutando = false;
let ultimaEjecucion = null;

function ahoraBogota(fecha = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value])
  );
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}

function minutosDeHora(texto) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(texto || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

async function paso(nombre, fn) {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`[programador] ${nombre} listo en ${Math.round((Date.now() - t0) / 1000)} s`); // eslint-disable-line no-console
    return { nombre, ok: true };
  } catch (err) {
    console.error(`[programador] ${nombre} falló:`, err.message); // eslint-disable-line no-console
    return { nombre, ok: false, error: err.message };
  }
}

// Corrida completa (04:00): todo desde cero en los dos proyectos. No toca Negocios (eso depende de los Excel de la
// fiducia, que llegan hacia las 12:00) ni el cierre de mes.
async function ejecutarSincronizacionCompleta() {
  if (ejecutando) return null;
  ejecutando = true;
  const resultados = [];
  try {
    console.log('[programador] Iniciando sincronización COMPLETA (todo)'); // eslint-disable-line no-console
    resultados.push(await paso('Zoho · Inventario (todo)', () => require('./baiaKristal/baiaInventario/baiaInventario.sync').syncInventario()));
    resultados.push(await paso('Zoho · Oportunidades (todo, con planes de pago)', () => require('./baiaKristal/baiaOportunidad/baiaOportunidad.sync').syncOportunidadesFromZoho(true)));
    resultados.push(await paso('HubSpot · Oportunidades Oliv (todo)', () => require('./oliv/olivOportunidad/olivOportunidad.sync').syncOportunidadesOliv('todo')));
    resultados.push(await paso('HubSpot · Inmuebles Oliv (todo)', () => require('./oliv/olivInmueble/olivInmueble.sync').syncInmueblesOliv('todo')));
    ultimaEjecucion = { tipo: 'completa', en: new Date().toISOString(), resultados };
    console.log('[programador] Sincronización completa terminada'); // eslint-disable-line no-console
    return ultimaEjecucion;
  } finally {
    ejecutando = false;
  }
}

async function ejecutarSincronizaciones() {
  if (ejecutando) return null;
  ejecutando = true;
  const resultados = [];
  try {
    console.log('[programador] Iniciando sincronizaciones diarias'); // eslint-disable-line no-console
    resultados.push(await paso('Zoho · Inventario', () => require('./baiaKristal/baiaInventario/baiaInventario.sync').syncInventario()));
    resultados.push(await paso('Zoho · Oportunidades (cambios)', () => require('./baiaKristal/baiaOportunidad/baiaOportunidad.sync').syncOportunidadesFromZoho(false)));
    resultados.push(await paso('HubSpot · Oportunidades Oliv (cambios)', () => require('./oliv/olivOportunidad/olivOportunidad.sync').syncOportunidadesOliv('cambios')));
    resultados.push(await paso('HubSpot · Inmuebles Oliv (cambios)', () => require('./oliv/olivInmueble/olivInmueble.sync').syncInmueblesOliv('cambios')));
    resultados.push(await paso('Negocios desde la fiducia', () => require('./baiaKristal/baiaNegocio/baiaNegocio.backfill').runBackfill()));
    resultados.push(await paso('Cierre de mes · Baía Kristal', () => require('./baiaKristal/baiaDashboard/baiaDashboard.service').cerrarMesAnteriorSiFalta()));
    resultados.push(await paso('Cierre de mes · Oliv', () => require('./oliv/olivResumen/olivResumen.service').cerrarMesAnteriorSiFalta()));
    ultimaEjecucion = { tipo: 'diaria', en: new Date().toISOString(), resultados };
    console.log('[programador] Sincronizaciones diarias terminadas'); // eslint-disable-line no-console
    return ultimaEjecucion;
  } finally {
    ejecutando = false;
  }
}

function iniciar() {
  if (process.env.AUTO_SYNC === 'false') return;
  const hora = process.env.AUTO_SYNC_HORA || DEFAULT_HORA;
  const horaCompleta = process.env.AUTO_SYNC_HORA_COMPLETA || DEFAULT_HORA_COMPLETA;
  const objetivo = minutosDeHora(hora);
  const objetivoCompleta = minutosDeHora(horaCompleta);
  if (objetivo == null || objetivoCompleta == null) {
    console.error(`[programador] Hora inválida (AUTO_SYNC_HORA="${hora}", AUTO_SYNC_HORA_COMPLETA="${horaCompleta}"), se esperaba HH:MM. No se programa nada.`); // eslint-disable-line no-console
    return;
  }
  // Si el servidor arranca ya pasada la hora de hoy, hoy se da por ejecutado (ver nota arriba).
  const inicio = ahoraBogota();
  if (inicio.minutos >= objetivo) ultimoDiaEjecutado = inicio.dia;
  if (inicio.minutos >= objetivoCompleta) ultimoDiaCompleta = inicio.dia;
  console.log(`[programador] Sincronización completa a las ${horaCompleta} y del día a las ${hora} (hora de Bogotá)`); // eslint-disable-line no-console

  setInterval(() => {
    const { dia, minutos } = ahoraBogota();
    if (minutos >= objetivoCompleta && ultimoDiaCompleta !== dia) {
      ultimoDiaCompleta = dia;
      ejecutarSincronizacionCompleta().catch((err) => console.error('[programador] Error inesperado (completa):', err.message)); // eslint-disable-line no-console
      return;
    }
    if (minutos < objetivo || ultimoDiaEjecutado === dia) return;
    ultimoDiaEjecutado = dia;
    ejecutarSincronizaciones().catch((err) => console.error('[programador] Error inesperado:', err.message)); // eslint-disable-line no-console
  }, 60 * 1000).unref();
}

const estado = () => ({ ejecutando, ultimaEjecucion, ultimoDiaEjecutado, ultimoDiaCompleta });

module.exports = { iniciar, ejecutarSincronizaciones, ejecutarSincronizacionCompleta, estado };
