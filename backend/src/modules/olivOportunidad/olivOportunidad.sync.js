// Sincroniza el objeto Deals de HubSpot -> OlivOportunidad. Filtrado del
// lado de HubSpot a `proyecto_inmobiliario_cac = 'Oliv'` -- el mismo
// HubSpot es compartido entre varios proyectos inmobiliarios de AED (ej.
// Almar), confirmado al ver los datos reales (pedido del usuario,
// 2026-09-11: "Negocio" = nombre_contacto, "Etapa" resuelta igual que
// Centro-aplicaciones-comerciales-AED, "Proyecto" = proyecto_inmobiliario_cac
// -- las tres son propiedades reales del Deal en HubSpot, calcadas 1:1 de
// cómo las usa esa misma app, ver server/index.js#GET /api/deals ahí).
//
// Sigue sin mapeo dinámico por tipo de campo (currency/inmueble/etc.) como
// el sync de Zoho -- se guarda el objeto `properties` completo en
// `propiedades` (JSONB) y se promueven a columna real solo las propiedades
// que ya sabemos que importan.
const sequelize = require('../../config/db');
const { listarPropiedades, buscarDeals, listarPipelines, listarAsociaciones } = require('../../utils/hubspotClient');
const { invalidarCacheResumenOliv } = require('../olivResumen/olivResumenCache');
const { ETAPA_MINIMA_ORDER } = require('../../utils/olivHelpers');
const OlivPropiedadMetadata = require('./olivPropiedadMetadata.model');
const OlivSyncLog = require('./olivSyncLog.model');
const { progresoSync, esCancelacion } = require('../../utils/progresoSync');

const progreso = progresoSync('oliv-oportunidades');

const PROYECTO = 'Oliv';
// Objeto personalizado "Unidades" de HubSpot -- mismo id que usa
// olivInmueble.sync.js/olivNegocio.service.js.
const UNIDADES_OBJECT_ID = '2-51798334';

async function syncPropiedadesMetadata() {
  console.log('[oliv-sync] Fetching deal properties from HubSpot...'); // eslint-disable-line no-console
  const propiedades = await listarPropiedades('deals');

  const BATCH = 50;
  for (let i = 0; i < propiedades.length; i += BATCH) {
    await Promise.all(
      propiedades.slice(i, i + BATCH).map((p) =>
        OlivPropiedadMetadata.upsert(
          { name: p.name, label: p.label, tipo: p.type, grupo: p.groupName || null, es_personalizado: !p.hubspotDefined },
          { conflictFields: ['name'] }
        )
      )
    );
  }

  console.log(`[oliv-sync] Saved ${propiedades.length} property definitions`); // eslint-disable-line no-console
  return propiedades;
}

// Mapa stageId -> { label, order, perdida } -- mismo mecanismo que
// Centro-aplicaciones-comerciales-AED/server/index.js (stageMap), pero acá
// también se guarda `displayOrder` (posición 0-indexada de la etapa dentro
// de SU pipeline) y si es la etapa de "perdido" (`probability === '0.0'`,
// la única etapa `isClosed` que no es una victoria) -- necesarios para el
// filtro "etapa 8 y superiores" (ETAPA_MINIMA_ORDER, ver olivHelpers.js) de list() (ver olivOportunidad.service.js),
// más confiable que parsear el texto "Etapa N" de la etiqueta (que ni
// siquiera existe para la etapa de perdido).
async function fetchStageMap() {
  const pipelines = await listarPipelines('deals');
  const stageMap = {};
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages || []) {
      stageMap[stage.id] = { label: stage.label, order: stage.displayOrder, perdida: stage.metadata?.probability === '0.0' };
    }
  }
  return stageMap;
}

// Filtrado del lado de HubSpot a proyecto Oliv Y etapa >= ETAPA_MINIMA_ORDER
// -- pedido explícito del usuario: "estás trayendo las 296 Oportunidades de
// Oliv y después las filtras por la etapa... la idea es que solo traigas
// las que cumplen con los requisitos". `dealstageIds` ya viene resuelto por
// el caller (fetchStageMap() + el mismo criterio de orden/perdida que usaba
// antes el filtro local, ver mapDeal más abajo).
// `desde` (ms, opcional): sync por cambios -- solo lo modificado en HubSpot desde esa fecha, SIN filtrar por etapa
// (así también llegan las que acaban de salir de una etapa válida, y se pueden quitar).
async function fetchAllDealsOliv(propertyNames, dealstageIds, desde = null) {
  const filterGroups = [
    {
      filters: desde
        ? [
            { propertyName: 'proyecto_inmobiliario_cac', operator: 'EQ', value: PROYECTO },
            { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(desde) },
          ]
        : [
            { propertyName: 'proyecto_inmobiliario_cac', operator: 'EQ', value: PROYECTO },
            { propertyName: 'dealstage', operator: 'IN', values: dealstageIds },
          ],
    },
  ];
  const allDeals = [];
  let after;
  let page = 1;

  do {
    progreso.verificar();
    console.log(`[oliv-sync] Fetching deals page ${page}...`); // eslint-disable-line no-console
    progreso.etiqueta(`Trayendo oportunidades de HubSpot (página ${page}, ${allDeals.length.toLocaleString('es-CO')} leídas)`);
    const data = await buscarDeals({ properties: propertyNames, limit: 100, after, filterGroups });
    const results = data.results || [];
    allDeals.push(...results);
    after = data.paging?.next?.after;
    page += 1;
  } while (after);

  return allDeals;
}

function mapDeal(deal, stageMap) {
  const props = deal.properties || {};
  const stageInfo = props.dealstage ? stageMap[props.dealstage] : null;
  return {
    hubspot_id: deal.id,
    deal_name: props.dealname || 'Sin nombre',
    nombre_contacto: props.nombre_contacto || null,
    email: props.correo || null,
    telefono: props.numero_de_telefono_movil || null,
    proyecto: props.proyecto_inmobiliario_cac || null,
    stage: stageInfo?.label ?? props.dealstage ?? null,
    // -1 si es la etapa de perdido -- nunca debe pasar un filtro ">= N", sin
    // importar qué tan alto sea su `displayOrder` real dentro del pipeline
    // (acá es el último, el más alto de todos). Ya no puede pasar en la
    // práctica (fetchAllDealsOliv filtra del lado de HubSpot), se deja como
    // resguardo si algún día se relaja ese filtro.
    stage_order: stageInfo ? (stageInfo.perdida ? -1 : stageInfo.order) : null,
    referencia_recaudo: props.referencia_de_recaudo || null,
    amount: props.amount != null && props.amount !== '' ? Number(props.amount) : null,
    close_date: props.closedate ? new Date(props.closedate) : null,
    propiedades: props,
  };
}

// Unidad asociada de HubSpot (Associations API nativa) -- verificada más
// confiable que cruzar por `unit_id` de la cotización del Cotizador de
// Cuotas (funciona incluso sin cotización aceptada), ver el comentario de
// cabecera de olivNegocio.service.js. Se resuelve acá, en sync, y no en
// cada request, para que Negocios pueda cruzar Inmueble<->Oportunidad
// localmente.
async function fetchInmuebleHubspotId(dealId) {
  try {
    const unidadIds = await listarAsociaciones('deals', dealId, UNIDADES_OBJECT_ID);
    return unidadIds[0] ?? null;
  } catch (err) {
    console.error(`[oliv-sync] Error resolviendo unidad asociada de deal ${dealId}:`, err.message); // eslint-disable-line no-console
    return null;
  }
}

// Upsert en SQL crudo con bind posicionales -- mismo motivo documentado en
// oportunidad.sync.js#upsertOportunidad: bajo lotes concurrentes
// (Promise.all), `replacements` con nombre de Sequelize puede mezclar
// valores entre llamadas paralelas que comparten el mismo texto de query.
async function upsertOlivOportunidad(data) {
  await sequelize.query(
    `INSERT INTO oliv_oportunidades (
       hubspot_id, deal_name, nombre_contacto, email, telefono, proyecto, stage, stage_order, referencia_recaudo, inmueble_hubspot_id, amount, close_date, propiedades,
       ultimo_sync_en, creado_en, actualizado_en
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, now(), now(), now())
     ON CONFLICT (hubspot_id) DO UPDATE SET
       deal_name = EXCLUDED.deal_name,
       nombre_contacto = EXCLUDED.nombre_contacto,
       email = EXCLUDED.email,
       telefono = EXCLUDED.telefono,
       proyecto = EXCLUDED.proyecto,
       stage = EXCLUDED.stage,
       stage_order = EXCLUDED.stage_order,
       referencia_recaudo = EXCLUDED.referencia_recaudo,
       inmueble_hubspot_id = EXCLUDED.inmueble_hubspot_id,
       amount = EXCLUDED.amount,
       close_date = EXCLUDED.close_date,
       propiedades = EXCLUDED.propiedades,
       ultimo_sync_en = now(),
       actualizado_en = now()`,
    {
      bind: [
        data.hubspot_id,
        data.deal_name,
        data.nombre_contacto,
        data.email,
        data.telefono,
        data.proyecto,
        data.stage,
        data.stage_order,
        data.referencia_recaudo,
        data.inmueble_hubspot_id,
        data.amount,
        data.close_date,
        JSON.stringify(data.propiedades || {}),
      ],
    }
  );
}

// Elimina de la DB local los negocios que ya no cumplen el filtro (bajaron
// de etapa, se perdieron, o cambiaron de proyecto) -- `deals` ya es el
// resultado COMPLETO y filtrado que devuelve HubSpot, así que cualquier
// hubspot_id que no esté ahí ya no califica. Resguardo: nunca borra si
// `deals` vino vacío (podría ser un hiccup transitorio de la API, no un
// vaciado real del pipeline).
async function limpiarOportunidadesObsoletas(hubspotIdsVigentes) {
  if (hubspotIdsVigentes.length === 0) return 0;
  const [, meta] = await sequelize.query(`DELETE FROM oliv_oportunidades WHERE proyecto = $1 AND NOT (hubspot_id = ANY($2::text[]))`, {
    bind: [PROYECTO, hubspotIdsVigentes],
  });
  return meta?.rowCount ?? 0;
}

// `modo`: 'todo' (por defecto; trae todo lo que cumple la regla y limpia lo que ya no la cumple) o 'cambios' (solo lo
// modificado en HubSpot desde la última sync buena; si no hay una, equivale a 'todo').
async function syncOportunidadesOliv(modo = 'todo') {
  const log = await OlivSyncLog.create({ status: 'running' });
  progreso.iniciar('Preparando la sincronización');

  try {
    const propiedades = await syncPropiedadesMetadata();
    const propertyNames = propiedades.map((p) => p.name);

    // La etapa hay que resolverla ANTES de pedir los deals -- pedido
    // explícito del usuario: filtrar del lado de HubSpot, no traer los 296
    // y descartar localmente.
    const stageMap = await fetchStageMap();
    const dealstageIds = Object.entries(stageMap)
      .filter(([, info]) => !info.perdida && info.order >= ETAPA_MINIMA_ORDER)
      .map(([id]) => id);

    if (dealstageIds.length === 0) {
      throw new Error('No se encontró ninguna etapa de HubSpot con order >= ETAPA_MINIMA_ORDER -- revisar pipelines de deals');
    }

    let desde = null;
    if (modo === 'cambios') {
      const ultima = await OlivSyncLog.findOne({ where: { status: 'success' }, order: [['finalizado_en', 'DESC']] });
      // Margen de 5 min por si el reloj de HubSpot y el de este servidor no coinciden.
      if (ultima?.finalizado_en) desde = new Date(ultima.finalizado_en).getTime() - 5 * 60 * 1000;
    }
    const traidos = await fetchAllDealsOliv(propertyNames, dealstageIds, desde);
    // Por cambios llegan también deals que ya no califican (cambiaron de etapa): se separan y se quitan de la base.
    const idsElegibles = new Set(dealstageIds);
    const deals = desde ? traidos.filter((d) => idsElegibles.has(d.properties?.dealstage)) : traidos;
    const yaNoCalifican = desde ? traidos.filter((d) => !idsElegibles.has(d.properties?.dealstage)).map((d) => String(d.id)) : [];
    console.log(`[oliv-sync] ${desde ? 'Por cambios' : 'Completo'}: ${traidos.length} deals traídos, ${deals.length} califican (etapa >= ${ETAPA_MINIMA_ORDER})`); // eslint-disable-line no-console // eslint-disable-line no-console

    progreso.fase('Guardando oportunidades', deals.length);
    const BATCH_SIZE = 50;
    let saved = 0;
    for (let i = 0; i < deals.length; i += BATCH_SIZE) {
      progreso.verificar(); // punto seguro: cada oportunidad se guarda entera
      const batch = deals.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (deal) => {
          const data = mapDeal(deal, stageMap);
          data.inmueble_hubspot_id = await fetchInmuebleHubspotId(deal.id);
          await upsertOlivOportunidad(data);
        })
      );
      saved += batch.length;
      progreso.establecer(saved);
      if (saved % 500 === 0 || saved === deals.length) {
        console.log(`[oliv-sync] Saved ${saved}/${deals.length} records...`); // eslint-disable-line no-console
      }
    }

    progreso.verificar(); // la limpieza es destructiva: nunca en una sync cancelada
    let eliminados = 0;
    if (desde) {
      // Por cambios solo se quitan los deals puntuales que HubSpot reportó como modificados y ya no califican.
      if (yaNoCalifican.length > 0) {
        const [, meta] = await sequelize.query('DELETE FROM oliv_oportunidades WHERE proyecto = $1 AND hubspot_id = ANY($2::text[])', { bind: [PROYECTO, yaNoCalifican] });
        eliminados = meta?.rowCount ?? 0;
      }
    } else {
      eliminados = await limpiarOportunidadesObsoletas(deals.map((d) => d.id));
    }
    if (eliminados > 0) {
      console.log(`[oliv-sync] Removed ${eliminados} stale records that no longer qualify.`); // eslint-disable-line no-console
    }

    await log.update({ finalizado_en: new Date(), status: 'success', registros_sync: saved });
    console.log(`[oliv-sync] Done. ${saved} records synced.`); // eslint-disable-line no-console

    // Invalida el cache del Resumen de Oliv (mismo criterio que
    // dashboard.service.js/dashboardCache.js en Baía Kristal: cualquier
    // módulo que toque las Oportunidades usadas en el cálculo invalida el
    // cache global, se reconstruye solo en el próximo request).
    invalidarCacheResumenOliv();

    progreso.terminar();
    return { success: true, recordsSync: saved };
  } catch (err) {
    progreso.terminar();
    if (esCancelacion(err)) {
      console.log('[oliv-sync] Cancelada por el usuario'); // eslint-disable-line no-console
      await log.update({ finalizado_en: new Date(), status: 'cancelled', error_msg: 'Cancelada por el usuario' });
      invalidarCacheResumenOliv(); // lo guardado hasta aquí ya cuenta
      return { success: false, cancelada: true };
    }
    console.error('[oliv-sync] Error:', err.message); // eslint-disable-line no-console
    await log.update({ finalizado_en: new Date(), status: 'error', error_msg: err.message });
    return { success: false, error: err.message };
  }
}

module.exports = { syncOportunidadesOliv, syncPropiedadesMetadata };
