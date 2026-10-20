// Sync bulk del módulo de SOLO LECTURA 'Otrosíes' (Baía Kristal, Cartera v2).
// Trae TODOS los Deals de Zoho con `Proyecto = Baia Kristal` (6664 medidos en
// vivo, cifra que fluctúa según Zoho), SIN el filtro de `pago_separacion` de
// Oportunidad (decisión del Jefe Gabriel: Otrosíes cubre el universo completo).
//
// ESTRATEGIA DE COBERTURA (decisión de god, 2026-09-23, opción (a)): tramos por
// `Etapa` (valores descubiertos con una MUESTRA paginada, unidos a los ya en
// DB) + barrido COMPLETO del criterio base `(Proyecto:equals:Baia Kristal)`
// (paginación completa: 34 páginas en vivo, Meredith validó sin tope). El
// barrido usa upsert-if-missing, así que no repite los que ya vinieron por
// tramos y garantiza que ningún Deals quede fuera (incluidos los sin Etapa).
// El total traído se compara contra el propio barrido base para advertir si
// algún tramo quedó inconcluso (warning de auditoría).
//
// El endpoint `/Deals/search` NO acepta operadores de negación/vacío (`is_empty`,
// `not_in`, `not_equals`, rangos de fecha, `id:greater_than` -- probados en
// vivo, todo 400/204), por eso los sin-Etapa no se aíslan por criteria y se
// cubren vía el barrido completo. `/settings/fields` da 401 (el refresh token no
// tiene scope); los valores de `Etapa` se descubren solos.
const axios = require('axios');
const { getAccessToken, _clearCache } = require('../../utils/zohoAuth');
const zohoConfig = require('../../config/zoho');
const sequelize = require('../../config/db');
const ZohoFieldMetadata = require('../oportunidad/zohoFieldMetadata.model');
const Otrosi = require('./otrosi.model');
const { progresoSync, esCancelacion } = require('../../utils/progresoSync');

const progreso = progresoSync('otrosies');

let running = false;
let result = null;
let ultimoSync = null;
let iniciadoEn = null;
// api_name resuelto dinámicamente para 'Referencia de Recaudo' (ver
// `resolverApiNameReferenciaRecaudo`) -- se rellena al arrancar cada sync.
let recaudoApiName = null;

const PROYECTO_CRITERIA = 'Proyecto:equals:Baia Kristal';
// `Stage` = el campo que en la UI de Zoho se llama 'ETAPA DEL NEGOCIO' (estado
// de negociación real: '1 INTERESADO', '12BC VINCULACION A FIDUCIA EXITOSA',
// etc.), el mismo que sincroniza `oportunidad.sync.js`. OJO: NO confundir con
// `Etapa` (etapa de construcción/partición, que además particiona este sync en
// tramos). `Referencia_de_Recaudo` se AGREGA después de resolver su api_name.
const CAMPOS_BASE = 'id,Deal_Name,Etapa,Stage,Otro_si_Requerido,Encargado_Otro_Si';
const CAMPOS_DISCOVERY = 'id,Etapa';
const MAX_DISCOVERY_PAGES = 10;
const GAP_MS = 150;
const BATCH_SIZE = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function zohoGet(path, params = {}) {
  const token = await getAccessToken();
  try {
    const response = await axios.get(`${zohoConfig.apiBase}${path}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, params });
    return response.data;
  } catch (err) {
    if (err.response?.status === 401) {
      _clearCache();
      const freshToken = await getAccessToken();
      const retry = await axios.get(`${zohoConfig.apiBase}${path}`, { headers: { Authorization: `Zoho-oauthtoken ${freshToken}` }, params });
      return retry.data;
    }
    throw err;
  }
}

// Muestra de hasta 10 páginas (2000 regs, dentro del límite documentado) del
// universo Baía Kristal pidiendo solo `Etapa` -- alcanza para descubrir los
// valores distintos del picklist sin recorrer los 6663.
async function descubrirEtapasEnVivo() {
  const etapas = new Set();
  for (let page = 1; page <= MAX_DISCOVERY_PAGES; page++) {
    const data = await zohoGet('/Deals/search', {
      criteria: `(${PROYECTO_CRITERIA})`,
      fields: CAMPOS_DISCOVERY,
      per_page: 200,
      page,
    });
    const deals = data.data || [];
    for (const d of deals) if (d.Etapa) etapas.add(d.Etapa);
    if (data.info?.more_records !== true) break;
    await sleep(GAP_MS);
  }
  return [...etapas];
}

async function etapasConocidas() {
  const de = await descubrirEtapasEnVivo();
  const enDb = await sequelize.query('SELECT DISTINCT etapa FROM baia_kristal_otrosies WHERE etapa IS NOT NULL', { type: sequelize.QueryTypes.SELECT });
  const todas = new Set(de);
  for (const r of enDb) if (r.etapa) todas.add(r.etapa);
  return [...todas].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

// Api_name de 'Referencia de Recaudo' resuelto DINÁMICAMENTE (Jefe Gabriel
// 2026-09-23) con EXACTAMENTE la misma cadena de `oportunidad.sync.js`, porque
// el nombre de API puede cambiar en Zoho y no se debe hardcodear: primero por
// `field_label` exacto, luego por `api_name` exacto, y por último el primer
// campo de texto cuyo label contenga 'recaudo'. Se lee de `zoho_field_metadata`
// (la tabla que `oportunidad.sync.js` puebla desde `/settings/fields`) y NO se
// vuelve a pedir `/settings/fields` desde acá: da 401 con el refresh token
// actual (sin el scope `ZohoCRM.settings.fields.READ`).
// Si no aparece, NO es fatal para este módulo (es una vista de solo lectura y
// la referencia es un dato adicional): avisa y sigue sincronizando el resto.
async function resolverApiNameReferenciaRecaudo() {
  const fields = await ZohoFieldMetadata.findAll({ raw: true });
  const recaudoField =
    fields.find((f) => (f.field_label || '').toLowerCase() === 'referencia de recaudo') ||
    fields.find((f) => (f.api_name || '').toLowerCase() === 'referencia_de_recaudo') ||
    fields.find((f) => (f.field_label || '').toLowerCase().includes('recaudo') && f.data_type === 'text');
  if (!recaudoField) {
    recaudoApiName = null;
    console.warn('[otrosiSync] No se encontró el campo "Referencia de Recaudo" en zoho_field_metadata -- se sincroniza sin esa columna'); // eslint-disable-line no-console
    return null;
  }
  recaudoApiName = recaudoField.api_name;
  console.log(`[otrosiSync] Referencia de Recaudo -> api_name "${recaudoField.api_name}" (label "${recaudoField.field_label}")`); // eslint-disable-line no-console
  return recaudoField.api_name;
}

async function traerTramo(criteria, campos, maxPages = null) {
  const filas = [];
  let page = 1;
  let moreRecords = true;
  while (moreRecords && (maxPages == null || page <= maxPages)) {
    const data = await zohoGet('/Deals/search', {
      criteria,
      fields: campos,
      per_page: 200,
      page,
    });
    const deals = data.data || [];
    filas.push(...deals);
    moreRecords = data.info?.more_records === true;
    page += 1;
    if (moreRecords) await sleep(GAP_MS);
  }
  return filas;
}

async function upsertOtrosi(deal) {
  await sequelize.query(
    `INSERT INTO baia_kristal_otrosies (
       zoho_deal_id, deal_name, etapa, stage, referencia_recaudo, otro_si_requerido, encargado_otro_si,
       sincronizado_en, creado_en, actualizado_en
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now(), now())
     ON CONFLICT (zoho_deal_id) DO UPDATE SET
       deal_name = EXCLUDED.deal_name,
       etapa = EXCLUDED.etapa,
       stage = EXCLUDED.stage,
       referencia_recaudo = EXCLUDED.referencia_recaudo,
       otro_si_requerido = EXCLUDED.otro_si_requerido,
       encargado_otro_si = EXCLUDED.encargado_otro_si,
       sincronizado_en = now(),
       actualizado_en = now()`,
    {
      bind: [
        String(deal.id),
        deal.Deal_Name || null,
        deal.Etapa || null,
        deal.Stage || null,
        recaudoApiName && deal[recaudoApiName] != null ? String(deal[recaudoApiName]) : null,
        deal.Otro_si_Requerido || null,
        deal.Encargado_Otro_Si || null,
      ],
    }
  );
}

async function syncOtrosiesFromZoho() {
  if (running) return result || { running: true };
  running = true;
  result = null;
  iniciadoEn = new Date();
  const startedAt = Date.now();
  progreso.iniciar('Descubriendo etapas en Zoho');
  let registros = 0;
  let errores = 0;

  try {
    const etapas = await etapasConocidas();
    const tramos = etapas.map((e) => `(${PROYECTO_CRITERIA})and(Etapa:equals:${e})`);

    const recaudoApi = await resolverApiNameReferenciaRecaudo();
    const camposSync = recaudoApi ? `${CAMPOS_BASE},${recaudoApi}` : CAMPOS_BASE;

    progreso.fase('Sincronizando por etapa', tramos.length + 1);
    console.log(`[otrosiSync] ${etapas.length} valores de Etapa descubiertos (${etapas.length} tramos) + barrido completo de sin-Etapa`); // eslint-disable-line no-console

    const idsSincronizados = new Set();
    async function guardarLote(filas) {
      for (let i = 0; i < filas.length; i += BATCH_SIZE) {
        progreso.verificar(); // punto seguro: cada otrosí se guarda entero
        const lote = filas.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(lote.map((deal) => upsertOtrosi(deal)));
        for (let j = 0; j < results.length; j++) {
          if (results[j].status === 'fulfilled') {
            registros++;
            const id = lote[j].id;
            if (id) idsSincronizados.add(String(id));
          } else {
            errores++;
            console.error('[otrosiSync] Error upsert:', results[j].reason?.message || results[j].reason); // eslint-disable-line no-console
          }
        }
      }
    }

    let totalPendientes = 0;
    for (const criteria of tramos) {
      progreso.verificar();
      const filas = await traerTramo(criteria, camposSync);
      totalPendientes += filas.length;
      await guardarLote(filas);
      progreso.avanzar(1);
      console.log(`[otrosiSync] Tramo ${criteria} -> ${filas.length} (acumulado ${registros})`); // eslint-disable-line no-console
      await sleep(GAP_MS);
    }

    // Cierre de cobertura: barrido del criterio base COMPLETO (paginación de
    // todas las páginas) para los Deals sin Etapa y cualquier valor de Etapa
    // que la muestra inicial no haya alcanzado. god autorizó esta forma (opción
    // (a), 2026-09-23): Meredith descartó empíricamente el límite de 2000 de
    // /search en esta misma cuenta (34 páginas, 200 en todas, 0 duplicados,
    // 6663 exactos), así que paginar el criterio base completo es seguro y
    // garantiza los 6663. Upsert-if-missing: no pisa lo ya sincronizado.
    progreso.verificar();
    progreso.fase('Barrido completo (cierre de cobertura)');
    const sobrantes = await traerTramo(`(${PROYECTO_CRITERIA})`, camposSync);
    const sobrantesNuevos = sobrantes.filter((d) => !idsSincronizados.has(String(d.id)));
    if (sobrantesNuevos.length) {
      await guardarLote(sobrantesNuevos);
    }
    console.log(`[otrosiSync] Barrido base: ${sobrantes.length} vistos, ${sobrantesNuevos.length} nuevos (sin Etapa o fuera de tramos)`); // eslint-disable-line no-console
    totalPendientes += sobrantesNuevos.length;

    // Cobertura completa: el total traído (tramos por Etapa + sobrantes del
    // barrido base) debe ser exactamente la cantidad que trae la paginación
    // completa del criterio base (6664 medida en vivo, fluctuante si Zoho
    // cambia). Si coinciden, no quedan Deals sin alcanzar; si no, alguno de los
    // tramos quedó en el aire y deja warning para auditoría.
    const coberturaCompleta = totalPendientes === sobrantes.length;
    if (!coberturaCompleta) {
      console.warn(`[otrosiSync] Total traído (${totalPendientes}) != total del criterio base (${sobrantes.length}) -- revisar tramos`); // eslint-disable-line no-console
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    result = { ok: true, registros, errores, tramos: tramos.length + 1, elapsed: `${elapsed}s` };
    ultimoSync = { status: 'success', iniciadoEn, finalizadoEn: new Date(), registrosSync: registros, errorMsg: null };
    console.log(`[otrosiSync] Listo: ${registros} registros en ${elapsed}s (${errores} errores)`); // eslint-disable-line no-console

    // Auto-trigger del backfill de verificación sobre los pendientes (NULL)
    // tras el sync -- solo toca filas sin verificar, nunca reprocesa las que ya
    // están en true/false (ver otrosi.backfill.js); si ya hay un backfill
    // corriendo, el próximo sync lo vuelve a evaluar.
    try {
      const { runOtrosiBackfill, isOtrosiBackfillRunning } = require('./otrosi.backfill');
      if (!isOtrosiBackfillRunning()) {
        const pendientes = await Otrosi.count({ where: { otro_si_tiene_archivo: null } });
        if (pendientes > 0) {
          console.log(`[otrosiSync] Auto-backfill de verificación sobre ${pendientes} pendiente(s)`); // eslint-disable-line no-console
          runOtrosiBackfill(false).catch((e) => console.error('[otrosiSync] Auto-backfill falló:', e.message)); // eslint-disable-line no-console
        }
      }
    } catch (e) {
      console.error('[otrosiSync] No se pudo autodisparar el backfill:', e.message); // eslint-disable-line no-console
    }
  } catch (err) {
    if (esCancelacion(err)) {
      console.log(`[otrosiSync] Cancelada por el usuario (${registros} registros ya guardados)`); // eslint-disable-line no-console
      result = { ok: false, cancelada: true, error: 'Cancelada por el usuario: se conservó lo ya guardado.' };
      ultimoSync = { status: 'cancelled', iniciadoEn, finalizadoEn: new Date(), registrosSync: registros, errorMsg: 'Cancelada por el usuario' };
    } else {
    console.error('[otrosiSync] Error fatal:', err.message); // eslint-disable-line no-console
    result = { ok: false, error: err.message };
    ultimoSync = { status: 'error', iniciadoEn, finalizadoEn: new Date(), registrosSync: registros, errorMsg: err.message };
    }
  } finally {
    progreso.terminar();
    running = false;
  }

  return result;
}

function isOtrosiSyncRunning() {
  return running;
}

function getOtrosiSyncResult() {
  return result;
}

function getOtrosiSyncStatus() {
  if (running) return { status: 'running', iniciadoEn, progreso: progreso.snapshot() };
  if (!ultimoSync) return { status: 'never' };
  return { ...ultimoSync };
}

module.exports = { syncOtrosiesFromZoho, isOtrosiSyncRunning, getOtrosiSyncResult, getOtrosiSyncStatus };