// Cruce Negocio<->Excel de fiducia + conciliación aproximada, extraído de
// `olivNegocio.service.js` (2026-09-25) para que `olivResumen.service.js`
// (Resumen Gerencial de Oliv) pueda reusar EXACTAMENTE el mismo cálculo por
// negocio en vez de duplicarlo -- ambos módulos necesitan, para cada
// Oportunidad, su resumen fiduciario (Aportes/movimientos/pagos) y su
// conciliación contra el plan de pagos de la cotización aceptada. Sin
// cambio de comportamiento: es un mover-tal-cual, no una reescritura.
//
// Cruce con el Excel "Saldos Acumulados por Concepto y Unidad" (ver
// olivEncargo.upload.js) -- columna "ENCARGO" del Excel = campo Referencia
// de Recaudo de HubSpot (`olivOportunidad.referencia_recaudo`). Pedido
// explícito del usuario (2026-09-14): el cruce es SOLO por esta Referencia,
// nunca por nombre.
//
// "AP" (Aportes) = plata que el comprador de verdad ha pagado -> Total
// abonado. "RB" (Rendimientos Brutos) ya NO llega hasta acá --
// olivEncargo.upload.js lo filtra antes de guardarlo como OlivMovimiento
// (pedido explícito del usuario, 2026-09-15), así que estas filas son
// siempre Aportes.
const sequelize = require('../../../config/db');
const { parseValorFiducia, detalleSinDuplicar } = require('../../../utils/olivHelpers');
const { conciliar } = require('../../baiaKristal/baiaDashboard/conciliacion');
const OlivMovimiento = require('../olivEncargo/olivMovimiento.model');
const OlivEncargo = require('../olivEncargo/olivEncargo.model');

const COD_CONCEPTO_APORTES = 'AP';

// Fecha del Excel (Jefe Gabriel, 2026-09-24) -- vive en `OlivEncargo.fecha`
// (una por Encargo, no por fila, ver olivEncargo.model.js), así que resolver
// la fecha de cada movimiento es un lookup por `encargo_id`, no una columna
// propia de `OlivMovimiento`. Una sola query chica (volumen chico de Oliv,
// decenas de Encargos, no miles).
async function fechasPorEncargo() {
  const encargos = await OlivEncargo.findAll({ attributes: ['id', 'fecha'], raw: true });
  return new Map(encargos.map((e) => [e.id, e.fecha]));
}

function agregarFilasFiduciarias(filas, fechasPorEncargoMap) {
  const acumulado = { aportes: 0, valorUnidad: null, identificacion: null, titular: null, movimientos: [], pagos: [] };
  for (const f of filas) {
    const d = f.datos || {};
    const valor = parseValorFiducia(d.VALOR);
    const fecha = fechasPorEncargoMap.get(f.encargo_id) ?? null;
    if (d.COD_CONCEPTO === COD_CONCEPTO_APORTES && valor != null) {
      acumulado.aportes += valor;
      // Para `conciliacionAproximada()` (Jefe Gabriel, 2026-09-24: "la
      // fecha de pago debe ser la fecha que tiene el movimiento que pagó
      // esa cuota") -- un `pago` real por cada movimiento de Aportes, con
      // SU fecha (la del Excel que lo trajo). Mismo shape `{id, valor,
      // fecha}` que espera `conciliar()` (dashboard/conciliacion.js).
      acumulado.pagos.push({ id: f.id, valor, fecha });
    }
    if (acumulado.valorUnidad == null) acumulado.valorUnidad = parseValorFiducia(d.VALOR_UNIDAD);
    if (!acumulado.identificacion && d.IDENTIFICACION) acumulado.identificacion = String(d.IDENTIFICACION).trim();
    if (!acumulado.titular && d.TITULAR) acumulado.titular = String(d.TITULAR).trim();
    acumulado.movimientos.push({
      id: f.id,
      concepto: d.CONCEPTO ?? d.COD_CONCEPTO ?? null,
      codigoConcepto: d.COD_CONCEPTO ?? null,
      valor,
      estado: d.ESTADO ?? null,
      fecha,
      detalle: detalleSinDuplicar(d),
    });
  }
  return acumulado;
}

// Para listados que necesitan TODOS los negocios de una vez (olivNegocio#list,
// olivResumen#construirFilasCompletas) -- una sola query, agrupada por
// Referencia (ENCARGO), más barata que una consulta por fila dado el volumen
// chico de Oliv (decenas de filas, no miles).
async function resumenFiduciarioTodos() {
  const [filas, mapaFechas] = await Promise.all([OlivMovimiento.findAll({ raw: true }), fechasPorEncargo()]);
  const porReferencia = new Map();
  for (const f of filas) {
    const ref = f.datos?.ENCARGO;
    if (!ref) continue;
    if (!porReferencia.has(ref)) porReferencia.set(ref, []);
    porReferencia.get(ref).push(f);
  }
  const mapa = new Map();
  for (const [ref, filasRef] of porReferencia) mapa.set(ref, agregarFilasFiduciarias(filasRef, mapaFechas));
  return mapa;
}

// Para getById(): una consulta dirigida contra la columna ENCARGO dentro
// del JSON `datos` (Postgres, vía sequelize.json) -- un solo negocio, no
// hace falta traer todo.
async function resumenFiduciarioDeReferencia(referencia) {
  if (!referencia) return null;
  const [filas, mapaFechas] = await Promise.all([
    OlivMovimiento.findAll({ where: sequelize.where(sequelize.json('datos.ENCARGO'), referencia), raw: true }),
    fechasPorEncargo(),
  ]);
  return filas.length > 0 ? agregarFilasFiduciarias(filas, mapaFechas) : null;
}

// Conciliación aproximada -- ver comentario de cabecera. `cotizacion.planDePago`
// ya trae cada cuota con `valor` y `fecha_estimada` reales (Centro
// Aplicaciones Comerciales), así que no hace falta pasar por
// `construirPlan()` (eso es para el subform crudo de Zoho de Baía Kristal) --
// solo se adapta el nombre de los campos que espera `conciliar()`. Sigue
// siendo aproximada (por eso `aproximada: true`): no sabemos EN QUÉ CUOTA
// puntual del plan cayó cada peso, solo el orden real de los pagos --
// `conciliar()` los aplica en orden cronológico contra las cuotas (prefijos
// acumulados), así que `fechaCubierta` es la fecha real del movimiento que
// completó el acumulado de esa cuota.
//
// Se omiten del plan las cuotas en $0 (bug real encontrado 2026-09-16,
// negocio 20091165756): un plan de cuotas trimestral genera una fila por MES
// aunque el pago real solo caiga cada 3 meses -- los meses intermedios
// llegan en $0 y `conciliar()` los marca "pagada" automáticamente
// (0-0<1), inflando cuotasPagadas. Se filtran ANTES de construir `cuotasPlan`.
const cuotaTieneValorReal = (o) => typeof o.valor === 'number' && o.valor > 0;

function conciliacionAproximada(cotizacion, fiducia) {
  if (!cotizacion?.planDePago?.length) return null;

  const cuotasPlan = cotizacion.planDePago.filter(cuotaTieneValorReal).map((o) => ({
    etiqueta: o.concepto,
    valorPlan: o.valor,
    fechaEstimada: o.fecha_estimada ? new Date(o.fecha_estimada) : null,
  }));
  if (cuotasPlan.length === 0) return null;
  // `conciliar()` hace una suma de prefijos sobre `pagos` EN EL ORDEN dado --
  // tienen que venir ordenados cronológicamente para que el prefijo cruce el
  // `requerido` de cada cuota en el orden real en que se pagó. Mismo criterio
  // de "sin fecha, al final" que `normalizarPagos()` (Baía Kristal).
  const pagos = (fiducia?.pagos ?? [])
    .map((p) => ({ id: p.id, valor: p.valor, fecha: p.fecha ? new Date(p.fecha) : null }))
    .sort((a, b) => {
      if (!a.fecha && !b.fecha) return 0;
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return a.fecha - b.fecha;
    });

  const { cuotas, resumen } = conciliar(cuotasPlan, pagos);
  return { cuotas, resumen, aproximada: true };
}

module.exports = { fechasPorEncargo, agregarFilasFiduciarias, resumenFiduciarioTodos, resumenFiduciarioDeReferencia, conciliacionAproximada };
