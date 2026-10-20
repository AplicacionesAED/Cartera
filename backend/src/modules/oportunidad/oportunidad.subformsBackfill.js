// Adaptado de zoho-payment-tracker/backend/src/baia-kristal/services/subformsBackfillService.js.
// Los subforms (Forma_de_Pago/Propuesta_de_Pago) no vienen en el GET masivo
// de Deals (ver oportunidad.sync.js) -- solo pidiendo el deal individual.
// Recorre las oportunidades con fecha de inicio de plan de pagos pero sin
// subform cacheado y los trae uno por uno. Se llama manualmente y
// automáticamente después de cada sync (ver oportunidad.sync.js).
const axios = require('axios');
const { Op } = require('sequelize');
const { getAccessToken } = require('../../utils/zohoAuth');
const zohoConfig = require('../../config/zoho');
const Oportunidad = require('./oportunidad.model');
const { invalidarCacheDashboard } = require('../dashboard/dashboardCache');
const { recalcularVinculos } = require('../vinculo/vinculoResolver');
const { progresoSync, esCancelacion } = require('../../utils/progresoSync');

const progreso = progresoSync('subforms');

let running = false;
let result = null;

const SKIP_SUBFORM_KEYS = ['$in_merge', '$field_states', '$layout_id', '$permissions', 'Parent_Id', 'Created_Time', 'Modified_Time'];

function limpiarFilasSubform(arr) {
  return (arr || []).map((row) => Object.fromEntries(Object.entries(row).filter(([k, v]) => !SKIP_SUBFORM_KEYS.includes(k) && v != null && v !== '')));
}

// Trae de Zoho el plan de pagos (Forma/Propuesta de Pago) de UNA oportunidad y SOBREESCRIBE lo guardado, aunque ya
// hubiera algo: es la forma de reflejar un cambio hecho en Zoho (el cache normal nunca se renueva solo).
async function refrescarSubformsDe(opp) {
  const token = await getAccessToken();
  const response = await axios.get(`${zohoConfig.apiBase}/Deals/${opp.zoho_id}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    params: { fields: 'Forma_de_Pago,Propuesta_de_Pago' },
  });
  const deal = response.data?.data?.[0] || {};
  const formaPago = limpiarFilasSubform(deal.Forma_de_Pago);
  const propuestaPago = limpiarFilasSubform(deal.Propuesta_de_Pago);
  await opp.update({ forma_pago: formaPago.length ? formaPago : null, propuesta_pago: propuestaPago.length ? propuestaPago : null });
  return { formaPago, propuestaPago };
}

// Tras un sync incremental: las oportunidades que Zoho reporta como modificadas pueden haber cambiado su plan de
// pagos, así que se vuelve a traer el de cada una (con un tope por si el incremental fue enorme).
async function refrescarSubformsLote(zohoIds, max = 300) {
  const ids = [...new Set(zohoIds)].slice(0, max);
  if (!ids.length) return { total: 0, actualizadas: 0, errores: 0 };
  const opps = await Oportunidad.findAll({ where: { zoho_id: { [Op.in]: ids } } });
  let actualizadas = 0;
  let errores = 0;
  for (const opp of opps) {
    try {
      await refrescarSubformsDe(opp);
      actualizadas++;
    } catch (err) {
      errores++;
      console.error(`[subforms] No se pudo refrescar ${opp.zoho_id}:`, err.message); // eslint-disable-line no-console
    }
  }
  console.log(`[subforms] Planes de pago refrescados tras el sync: ${actualizadas}/${opps.length} (${errores} errores)`); // eslint-disable-line no-console
  if (actualizadas > 0) invalidarCacheDashboard();
  return { total: opps.length, actualizadas, errores };
}

// `todos = false`: solo las que no tienen plan guardado (lo normal). `todos = true`: relee el plan de TODAS las
// oportunidades guardadas y sobreescribe lo guardado -- para reflejar cambios hechos en Zoho.
// Trae y guarda el plan de una oportunidad; si Zoho rechaza por velocidad o falla un momento, reintenta una vez.
async function consultarYGuardar(opp) {
  try {
    return await refrescarSubformsDe(opp);
  } catch (err) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return refrescarSubformsDe(opp);
  }
}

async function runSubformsBackfill(todos = false) {
  if (running) return;
  running = true;
  result = null;
  progreso.iniciar('Buscando oportunidades sin plan de pagos');
  const startedAt = Date.now();
  let procesadas = 0;
  let actualizadas = 0;
  let errores = 0;

  function reportarProgreso(total) {
    const elapsedMs = Date.now() - startedAt;
    const porcentaje = total > 0 ? Math.round((procesadas / total) * 100) : 100;
    const promedioMsPorItem = procesadas > 0 ? elapsedMs / procesadas : null;
    const restantes = total - procesadas;
    const segundosRestantesEstimados = promedioMsPorItem != null ? Math.round((promedioMsPorItem * restantes) / 1000) : null;
    result = { running: true, total, procesadas, porcentaje, actualizadas, errores, segundosTranscurridos: Math.round(elapsedMs / 1000), segundosRestantesEstimados };
  }

  try {
    const pendientes = await Oportunidad.findAll({
      where: todos
        ? {} // TODAS las oportunidades que trae el sistema, tengan o no fecha de inicio de plan
        : { fecha_inicio_plan_pagos: { [Op.ne]: null }, forma_pago: null, propuesta_pago: null },
      attributes: ['id', 'zoho_id'],
    });

    progreso.fase(todos ? 'Releyendo todos los planes de pago' : 'Trayendo planes de pago', pendientes.length);
    reportarProgreso(pendientes.length);

    // 5 consultas a Zoho a la vez (antes una por una). Entre grupos se revisa si el usuario pidió cancelar: así lo ya
    // guardado queda completo (cada plan se guarda entero) y nunca se corta a mitad de una oportunidad.
    const CONCURRENCIA = 5;
    for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
      progreso.verificar();
      const grupo = pendientes.slice(i, i + CONCURRENCIA);
      await Promise.all(
        grupo.map(async (opp) => {
          try {
            await consultarYGuardar(opp);
            actualizadas++;
          } catch (err) {
            errores++;
            console.error(`[subformsBackfill] Error en ${opp.zoho_id}:`, err.message); // eslint-disable-line no-console
          }
          procesadas++;
        })
      );
      progreso.establecer(procesadas);
      reportarProgreso(pendientes.length);
      if (procesadas % 50 < CONCURRENCIA || procesadas === pendientes.length) {
        console.log(`[subformsBackfill] Progreso: ${procesadas}/${pendientes.length} (${actualizadas} ok, ${errores} errores)`); // eslint-disable-line no-console
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    result = { ok: true, total: pendientes.length, actualizadas, errores, elapsed: `${elapsed}s` };
    console.log(`[subformsBackfill] Listo: ${actualizadas}/${pendientes.length} en ${elapsed}s (${errores} errores)`); // eslint-disable-line no-console
    if (actualizadas > 0) {
      await recalcularVinculos().catch((e) => console.error('[vinculos] Error al recalcular:', e.message)); // eslint-disable-line no-console
      invalidarCacheDashboard();
    }
  } catch (err) {
    if (esCancelacion(err)) {
      console.log(`[subformsBackfill] Cancelado por el usuario (${actualizadas} planes ya guardados)`); // eslint-disable-line no-console
      result = { ok: false, cancelada: true, total: procesadas, actualizadas, errores, error: `Cancelado: se conservaron ${actualizadas} planes ya actualizados.` };
    } else {
      result = { ok: false, error: err.message };
      console.error('[subformsBackfill] Error fatal:', err.message); // eslint-disable-line no-console
    }
  } finally {
    progreso.terminar();
    running = false;
  }
}

function isSubformsBackfillRunning() {
  return running;
}

function getSubformsBackfillResult() {
  return result;
}

const getSubformsBackfillProgreso = () => progreso.snapshot();

module.exports = { refrescarSubformsDe, refrescarSubformsLote, runSubformsBackfill, isSubformsBackfillRunning, getSubformsBackfillResult, getSubformsBackfillProgreso };
