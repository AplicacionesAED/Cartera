// Pantalla de Inicio: por proyecto (Baía Kristal / Oliv), 4 KPIs y un panel de
// alertas accionables, calculados sobre los servicios que ya alimentan
// Dashboard / Cartera / Otrosíes (mismos caches, ninguna lógica financiera
// nueva). Cada KPI y cada alerta se OMITE si el usuario no tiene el permiso
// del módulo al que enlaza -- nunca se muestra un número que no puede abrir.
const dashboardService = require('../dashboard/dashboard.service');
const olivService = require('../olivResumen/olivResumen.service');
const Otrosi = require('../otrosi/otrosi.model');
const SyncLog = require('../oportunidad/syncLog.model');
const OlivSyncLog = require('../olivOportunidad/olivSyncLog.model');
const configuracionFrenteService = require('../configuracionFrente/configuracionFrente.service');
const { tienePermiso, getRolesPermisos } = require('../../utils/permisos');

const HORAS_SYNC_DESACTUALIZADA = 36;
const DIAS_PROXIMOS = 7;
const TZ = 'America/Bogota';

// Fecha de hoy en Bogotá como { mes: 'YYYY-MM', dias: ['YYYY-MM-DD', ...] } con los
// próximos DIAS_PROXIMOS días (mañana..+7) -- mismas claves que usa conciliacion.js
// (mesKey/diaKey), así se cruzan directo con `totales`/`totalesDia`.
function ventanaHoy() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m, d] = partes.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const dias = [];
  for (let i = 1; i <= DIAS_PROXIMOS; i += 1) dias.push(new Date(base + i * 86400000).toISOString().slice(0, 10));
  return { mes: `${y}-${String(m).padStart(2, '0')}`, dias };
}

function mapSync(log) {
  if (!log) return { status: 'never' };
  return { status: log.status, iniciadoEn: log.iniciado_en, finalizadoEn: log.finalizado_en, registrosSync: log.registros_sync, errorMsg: log.error_msg };
}

// null = todo bien; si no, una alerta lista para el panel.
function alertaDeSync(sync, etiquetaCrm, esAdmin) {
  // Sincronización es solo para administradores: al resto se les avisa pero sin enlace.
  const to = esAdmin ? '/accesos/sincronizacion' : null;
  if (sync.status === 'error') {
    return { id: 'sync', tipo: 'danger', titulo: `La última sincronización con ${etiquetaCrm} falló`, detalle: String(sync.errorMsg ?? '').slice(0, 120) || 'Revisa el detalle en Sincronización.', to };
  }
  if (sync.status === 'never') {
    return { id: 'sync', tipo: 'warning', titulo: `Aún no hay sincronizaciones con ${etiquetaCrm}`, detalle: 'Los datos pueden estar vacíos o desactualizados.', to };
  }
  const fin = sync.finalizadoEn ?? sync.iniciadoEn;
  const horas = fin ? (Date.now() - new Date(fin).getTime()) / 3600000 : Infinity;
  if (horas > HORAS_SYNC_DESACTUALIZADA) {
    return { id: 'sync', tipo: 'warning', titulo: `Los datos de ${etiquetaCrm} llevan ${horas >= 48 ? `${Math.floor(horas / 24)} días` : `${Math.floor(horas)} h`} sin actualizarse`, detalle: 'La última sincronización exitosa es anterior a hace un día y medio.', to };
  }
  return null;
}

// KPIs + alertas de cartera comunes a los dos proyectos. `dash` y `mora*` son
// opcionales (null si el usuario no tiene el módulo).
function armarCartera({ dash, moraInicial, moraContraentrega, rutas, mes, dias }) {
  const kpis = [];
  const alertas = [];

  if (dash) {
    kpis.push({ key: 'porRecaudar', label: 'Por recaudar', tipo: 'moneda', valor: dash.totalesColumnasFijas?.pendienteRecaudar ?? 0, to: rutas.dashboard });
    kpis.push({ key: 'recaudadoMes', label: 'Recaudado del mes', tipo: 'moneda', valor: dash.totales?.[mes]?.recaudado ?? 0, to: rutas.dashboard });
    const proximos = dias.reduce((acc, d) => acc + (dash.totalesDia?.[d]?.porRecaudar ?? 0), 0);
    if (proximos > 0) {
      alertas.push({ id: 'proximos', tipo: 'info', titulo: `Cuotas que vencen en los próximos ${DIAS_PROXIMOS} días`, detalle: 'Monto esperado por recaudar entre mañana y la próxima semana.', monto: proximos, to: rutas.dashboard });
    }
  }

  if (moraInicial) {
    kpis.push({ key: 'montoMora', label: 'Monto en mora', tipo: 'moneda', valor: moraInicial.resumen.totalMontoEnMora, sub: `${moraInicial.resumen.negociosEnMora} negocios`, advertencia: moraInicial.resumen.totalMontoEnMora > 0, to: rutas.cartera });
    kpis.push({ key: 'cuotasMora', label: 'Cuotas en mora', tipo: 'numero', valor: moraInicial.resumen.totalCuotasEnMora, to: rutas.cartera });
    const critica = moraInicial.porRangoMora.find((r) => r.rango === '90+');
    if (critica?.count > 0) {
      alertas.push({ id: 'mora90', tipo: 'danger', titulo: 'Negocios con más de 90 días de mora', detalle: 'Mora crítica de la Cuota Inicial.', cuenta: critica.count, monto: critica.monto, to: `${rutas.cartera}?rango=90%2B` });
    }
  }
  if (moraContraentrega && moraContraentrega.resumen.negociosEnMora > 0) {
    alertas.push({ id: 'contraentrega', tipo: 'warning', titulo: 'Saldo Contraentrega vencido', detalle: 'Inmuebles cuyo saldo final ya venció (puede ser que aún no se haya escriturado).', cuenta: moraContraentrega.resumen.negociosEnMora, monto: moraContraentrega.resumen.totalMontoEnMora, to: `${rutas.cartera}?vista=contraentrega` });
  }
  return { kpis, alertas };
}

const ORDEN_ALERTA = { danger: 0, warning: 1, info: 2 };
const ordenarAlertas = (alertas) => [...alertas].sort((a, b) => ORDEN_ALERTA[a.tipo] - ORDEN_ALERTA[b.tipo]);

async function inicioBaiaKristal(puede, esAdmin) {
  const veDashboard = puede('dashboard');
  const veCartera = puede('cartera-mora');
  const veOtrosies = puede('otrosies');
  const veOportunidades = puede('oportunidades');
  if (!veDashboard && !veCartera && !veOtrosies && !veOportunidades) return null;

  const { mes, dias } = ventanaHoy();
  const [dash, moraInicial, moraContraentrega, sinVerificar, syncLog, filasFechas] = await Promise.all([
    veDashboard ? dashboardService.obtenerDashboardRecaudo({ page: 1, limit: 1 }) : null,
    veCartera ? dashboardService.obtenerCarteraMora({ vista: 'inicial', page: 1, limit: 1 }) : null,
    veCartera ? dashboardService.obtenerCarteraMora({ vista: 'contraentrega', page: 1, limit: 1 }) : null,
    veOtrosies ? Otrosi.count({ where: { otro_si_tiene_archivo: true, verificado: false } }) : null,
    SyncLog.findOne({ order: [['iniciado_en', 'DESC']] }),
    esAdmin ? configuracionFrenteService.list() : null,
  ]);

  const { kpis, alertas } = armarCartera({ dash, moraInicial, moraContraentrega, rutas: { dashboard: '/dashboard', cartera: '/cartera-mora' }, mes, dias });

  if (sinVerificar > 0) {
    alertas.push({ id: 'otrosies', tipo: 'warning', titulo: 'Otrosíes sin verificar contra el CRM', detalle: 'Tienen el documento pero nadie ha comparado el plan de pagos de Zoho.', cuenta: sinVerificar, to: '/otrosies?verificado=no' });
  }
  if (filasFechas) {
    const porFrente = new Map();
    for (const f of filasFechas) porFrente.set(f.frente, (porFrente.get(f.frente) ?? false) || Boolean(f.fechaEntrega));
    const sinFecha = [...porFrente.values()].filter((tiene) => !tiene).length;
    if (sinFecha > 0) {
      alertas.push({ id: 'fechas', tipo: 'info', titulo: 'Frentes sin fecha de entrega configurada', detalle: 'La conciliación usa la fecha estimada del plan en vez de la real.', cuenta: sinFecha, to: '/accesos/frentes' });
    }
  }

  const sync = mapSync(syncLog);
  const alertaSync = alertaDeSync(sync, 'Zoho', esAdmin);
  if (alertaSync) alertas.push(alertaSync);
  return { nombre: 'Baía Kristal', kpis, alertas: ordenarAlertas(alertas), sync };
}

async function inicioOliv(puede, esAdmin) {
  const veDashboard = puede('oliv-dashboard');
  const veCartera = puede('oliv-cartera-mora');
  const veOportunidades = puede('oliv-oportunidades');
  if (!veDashboard && !veCartera && !veOportunidades) return null;

  const { mes, dias } = ventanaHoy();
  const [dash, moraInicial, moraContraentrega, syncLog] = await Promise.all([
    veDashboard ? olivService.obtenerDashboardRecaudo({ page: 1, limit: 1 }) : null,
    veCartera ? olivService.obtenerCarteraMora({ vista: 'inicial', page: 1, limit: 1 }) : null,
    veCartera ? olivService.obtenerCarteraMora({ vista: 'contraentrega', page: 1, limit: 1 }) : null,
    OlivSyncLog.findOne({ order: [['iniciado_en', 'DESC']] }),
  ]);

  const { kpis, alertas } = armarCartera({ dash, moraInicial, moraContraentrega, rutas: { dashboard: '/oliv/dashboard', cartera: '/oliv/cartera-mora' }, mes, dias });
  const sync = mapSync(syncLog);
  const alertaSync = alertaDeSync(sync, 'HubSpot', esAdmin);
  if (alertaSync) alertas.push(alertaSync);
  return { nombre: 'Oliv', kpis, alertas: ordenarAlertas(alertas), sync };
}

async function obtenerInicio(usuario) {
  const permisosPorRol = await getRolesPermisos();
  const puede = (modulo) => tienePermiso(usuario.roles, modulo, permisosPorRol, usuario.esAdmin);
  const [baia, oliv] = await Promise.all([inicioBaiaKristal(puede, Boolean(usuario.esAdmin)), inicioOliv(puede, Boolean(usuario.esAdmin))]);
  return { baia, oliv };
}

module.exports = { obtenerInicio };
