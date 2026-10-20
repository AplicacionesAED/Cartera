// Adaptado de zoho-payment-tracker/backend/src/baia-kristal/services/inventarioSync.js.
// Trae TODO el inventario (Products de Zoho) sin filtrar por categoría.
// Sync manual (sin cron todavía -- ver hoja de ruta, fase de cron jobs),
// estado en memoria del proceso (running/result).
const axios = require('axios');
const { getAccessToken } = require('../../utils/zohoAuth');
const config = require('../../config/zoho');
const InventarioItem = require('./inventarioItem.model');
const { invalidarCacheDashboard } = require('../dashboard/dashboardCache');
const { recalcularVinculos } = require('../vinculo/vinculoResolver');
const { progresoSync } = require('../../utils/progresoSync');

const progreso = progresoSync('inventario');

async function fetchAllProducts() {
  const token = await getAccessToken();
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  const all = [];
  let page = 1;
  let moreRecords = true;

  while (moreRecords) {
    console.log(`[inventario] Fetching Products página ${page}...`); // eslint-disable-line no-console
    const res = await axios.get(`${config.apiBase}/Products`, { headers, params: { per_page: 200, page } });
    const data = res.data.data || [];
    all.push(...data);
    moreRecords = res.data.info?.more_records === true;
    page += 1;
  }

  return all;
}

// Filtra metadatos internos de Zoho ($state, $approval, etc.) y valores
// vacíos -- el resto se guarda tal cual, sin reformatear.
function limpiarDatos(p) {
  const datos = {};
  for (const [k, v] of Object.entries(p)) {
    if (k.startsWith('$')) continue;
    if (v === null || v === undefined || v === '') continue;
    datos[k] = v;
  }
  return datos;
}

function mapProducto(p) {
  const proyecto = p.Proyecto && typeof p.Proyecto === 'object' ? p.Proyecto.name : p.Proyecto || null;
  return {
    zoho_id: p.id,
    nombre: p.Product_Name || p.Nombre || null,
    proyecto,
    torre: p.Proyecto_Torre || p.Block_Tower || null,
    piso: p.Piso || null,
    categoria: p.Product_Category || null,
    estado: p.Estado_del_Inmueble || null,
    referencia_recaudo: p.Referencia_de_Recaudo || null,
    datos: limpiarDatos(p),
    ultimo_sync_en: new Date(),
  };
}

let syncRunning = false;
let syncResult = null;

async function syncInventario() {
  if (syncRunning) return;
  syncRunning = true;
  syncResult = null;
  const startedAt = Date.now();
  progreso.iniciar('Trayendo productos de Zoho');

  try {
    const productos = await fetchAllProducts();
    progreso.fase('Guardando productos', productos.length);
    console.log(`[inventario] ${productos.length} productos traídos de Zoho`); // eslint-disable-line no-console

    const BATCH_SIZE = 50;
    let saved = 0;
    for (let i = 0; i < productos.length; i += BATCH_SIZE) {
      const batch = productos.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((p) => {
          const data = mapProducto(p);
          return InventarioItem.upsert(data, { conflictFields: ['zoho_id'] });
        })
      );
      saved += batch.length;
      progreso.establecer(saved);
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    syncResult = { ok: true, total: productos.length, saved, elapsed: `${elapsed}s` };
    console.log(`[inventario] Listo: ${saved} productos en ${elapsed}s`); // eslint-disable-line no-console
    await recalcularVinculos().catch((e) => console.error('[vinculos] Error al recalcular:', e.message)); // eslint-disable-line no-console
    invalidarCacheDashboard();
  } catch (err) {
    console.error('[inventario] Error:', err.message); // eslint-disable-line no-console
    syncResult = { ok: false, error: err.message };
  } finally {
    progreso.terminar();
    syncRunning = false;
  }
}

function getSyncStatus() {
  return { running: syncRunning, result: syncResult, progreso: progreso.snapshot() };
}

module.exports = { syncInventario, getSyncStatus };
