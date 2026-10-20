// Sincroniza el objeto personalizado "Unidades" de HubSpot (id '2-51798334')
// -> OlivInmueble, filtrado del lado de HubSpot a
// `proyecto_inmobiliario = 'Oliv'` -- mismo objeto y mismas propiedades que
// usa Centro-Aplicaciones-Comerciales-AED (Cotizador de Cuotas) para listar
// unidades, ver server/index.js#fetchProjectUnits ahí (por eso acá no hace
// falta descubrir propiedades dinámicamente como sí toca con Oportunidades
// -- ya se sabe cuáles importan). Estado de sync en memoria del proceso
// (running/result), mismo patrón que inventario.sync.js (Baía Kristal/Zoho)
// -- sin SyncLog en base de datos, a diferencia de Oportunidades.
const sequelize = require('../../config/db');
const { buscarObjeto } = require('../../utils/hubspotClient');
const { invalidarCacheResumenOliv } = require('../olivResumen/olivResumenCache');
const { progresoSync, esCancelacion } = require('../../utils/progresoSync');

const progreso = progresoSync('oliv-inmuebles');

const UNIDADES_OBJECT_ID = '2-51798334';
const PROYECTO = 'Oliv';

const PROPIEDADES = [
  'id_unidad', 'torre', 'piso', 'codigo_unidad',
  'valor_unidad_comercial', 'valor_m_comercial', 'built_area_m2', 'view_type',
  'private_area_m2', 'terrace_area_m2',
  'property_type', 'unit_status',
  'proyecto_inmobiliario', 'number_bedrooms', 'number_bathrooms', 'bono',
  'tipo_de_apartamento', 'floor_plan_link',
];

async function fetchAllUnidadesOliv() {
  const filterGroups = [{ filters: [{ propertyName: 'proyecto_inmobiliario', operator: 'EQ', value: PROYECTO }] }];
  const all = [];
  let after;
  let page = 1;

  do {
    progreso.verificar();
    console.log(`[oliv-inmuebles-sync] Fetching unidades página ${page}...`); // eslint-disable-line no-console
    const data = await buscarObjeto(UNIDADES_OBJECT_ID, { properties: PROPIEDADES, limit: 100, after, filterGroups });
    const results = data.results || [];
    all.push(...results);
    after = data.paging?.next?.after;
    page += 1;
  } while (after);

  return all;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// La propiedad `torre` de HubSpot es un ID interno ("1"/"2"), no el nombre
// real de la torre -- confirmado con datos reales: "1" = todas las unidades
// "LIVA - ...", "2" = todas las "SEIVA - ...". El nombre real (SEIVA/LIVA,
// pedido explícito del usuario, 2026-09-11) viene siempre como el prefijo
// de `codigo_unidad` ("SEIVA - 106" -> "SEIVA"), sin excepción en las 96
// unidades reales -- se usa eso en vez de la propiedad `torre` cruda.
function torreDesdeCodigoUnidad(codigoUnidad) {
  if (!codigoUnidad) return null;
  const prefijo = codigoUnidad.split(' - ')[0]?.trim();
  return prefijo || null;
}

function mapUnidad(item) {
  const props = item.properties || {};
  return {
    hubspot_id: item.id,
    codigo_unidad: props.codigo_unidad || null,
    id_unidad: props.id_unidad || null,
    proyecto: props.proyecto_inmobiliario || null,
    torre: torreDesdeCodigoUnidad(props.codigo_unidad),
    piso: num(props.piso),
    categoria: props.property_type || null,
    tipo_apartamento: props.tipo_de_apartamento || null,
    estado: props.unit_status || null,
    valor_comercial: num(props.valor_unidad_comercial),
    valor_m2: num(props.valor_m_comercial),
    area_construida: num(props.built_area_m2),
    area_privada: num(props.private_area_m2),
    area_terraza: num(props.terrace_area_m2),
    alcobas: props.number_bedrooms || null,
    banos: num(props.number_bathrooms),
    bono: num(props.bono),
    tipo_vista: props.view_type || null,
    plano_link: props.floor_plan_link || null,
    propiedades: props,
  };
}

// Upsert en SQL crudo con bind posicionales -- mismo motivo documentado en
// olivOportunidad.sync.js#upsertOlivOportunidad.
async function upsertOlivInmueble(data) {
  await sequelize.query(
    `INSERT INTO oliv_inmuebles (
       hubspot_id, codigo_unidad, id_unidad, proyecto, torre, piso, categoria, tipo_apartamento, estado,
       valor_comercial, valor_m2, area_construida, area_privada, area_terraza, alcobas, banos, bono, tipo_vista, plano_link, propiedades,
       ultimo_sync_en, creado_en, actualizado_en
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, now(), now(), now())
     ON CONFLICT (hubspot_id) DO UPDATE SET
       codigo_unidad = EXCLUDED.codigo_unidad,
       id_unidad = EXCLUDED.id_unidad,
       proyecto = EXCLUDED.proyecto,
       torre = EXCLUDED.torre,
       piso = EXCLUDED.piso,
       categoria = EXCLUDED.categoria,
       tipo_apartamento = EXCLUDED.tipo_apartamento,
       estado = EXCLUDED.estado,
       valor_comercial = EXCLUDED.valor_comercial,
       valor_m2 = EXCLUDED.valor_m2,
       area_construida = EXCLUDED.area_construida,
       area_privada = EXCLUDED.area_privada,
       area_terraza = EXCLUDED.area_terraza,
       alcobas = EXCLUDED.alcobas,
       banos = EXCLUDED.banos,
       bono = EXCLUDED.bono,
       tipo_vista = EXCLUDED.tipo_vista,
       plano_link = EXCLUDED.plano_link,
       propiedades = EXCLUDED.propiedades,
       ultimo_sync_en = now(),
       actualizado_en = now()`,
    {
      bind: [
        data.hubspot_id,
        data.codigo_unidad,
        data.id_unidad,
        data.proyecto,
        data.torre,
        data.piso,
        data.categoria,
        data.tipo_apartamento,
        data.estado,
        data.valor_comercial,
        data.valor_m2,
        data.area_construida,
        data.area_privada,
        data.area_terraza,
        data.alcobas,
        data.banos,
        data.bono,
        data.tipo_vista,
        data.plano_link,
        JSON.stringify(data.propiedades || {}),
      ],
    }
  );
}

let syncRunning = false;
let syncResult = null;

async function syncInmueblesOliv() {
  if (syncRunning) return;
  syncRunning = true;
  syncResult = null;
  const startedAt = Date.now();
  progreso.iniciar('Trayendo unidades de HubSpot');

  try {
    const unidades = await fetchAllUnidadesOliv();
    progreso.fase('Guardando unidades', unidades.length);
    console.log(`[oliv-inmuebles-sync] ${unidades.length} unidades traídas de HubSpot`); // eslint-disable-line no-console

    const BATCH_SIZE = 50;
    let saved = 0;
    for (let i = 0; i < unidades.length; i += BATCH_SIZE) {
      progreso.verificar(); // punto seguro: cada unidad se guarda entera
      const batch = unidades.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((u) => upsertOlivInmueble(mapUnidad(u))));
      saved += batch.length;
      progreso.establecer(saved);
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    syncResult = { ok: true, total: unidades.length, saved, elapsed: `${elapsed}s` };
    console.log(`[oliv-inmuebles-sync] Listo: ${saved} unidades en ${elapsed}s`); // eslint-disable-line no-console
    // Invalida el cache del Resumen de Oliv -- ver el mismo comentario en
    // olivOportunidad.sync.js.
    invalidarCacheResumenOliv();
  } catch (err) {
    if (esCancelacion(err)) {
      console.log('[oliv-inmuebles-sync] Cancelada por el usuario'); // eslint-disable-line no-console
      syncResult = { ok: false, cancelada: true, error: 'Cancelada por el usuario: se conservó lo ya guardado.' };
      invalidarCacheResumenOliv(); // lo guardado hasta aquí ya cuenta
    } else {
      console.error('[oliv-inmuebles-sync] Error:', err.message); // eslint-disable-line no-console
      syncResult = { ok: false, error: err.message };
    }
  } finally {
    progreso.terminar();
    syncRunning = false;
  }
}

function getSyncStatus() {
  return { running: syncRunning, result: syncResult, progreso: progreso.snapshot() };
}

module.exports = { syncInmueblesOliv, getSyncStatus };
