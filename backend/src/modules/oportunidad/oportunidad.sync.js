// Adaptado de zoho-payment-tracker/backend/src/baia-kristal/services/zohoSync.js.
// Sincroniza el módulo Deals de Zoho CRM -> Oportunidad, con mapeo DINÁMICO
// de campos (nunca hardcodea api_names de Zoho más allá de los base) -- ver
// syncFieldMetadata()/buildFieldsList() más abajo. Adapta automáticamente si
// cambian los nombres de campos en Zoho.
const axios = require('axios');
const { getAccessToken, _clearCache } = require('../../utils/zohoAuth');
const config = require('../../config/zoho');
const sequelize = require('../../config/db');
const ZohoFieldMetadata = require('./zohoFieldMetadata.model');
const SyncLog = require('./syncLog.model');
const { runSubformsBackfill } = require('./oportunidad.subformsBackfill');
const { invalidarCacheDashboard } = require('../dashboard/dashboardCache');
const { recalcularVinculos } = require('../vinculo/vinculoResolver');
const { progresoSync } = require('../../utils/progresoSync');

async function zohoGet(path, params = {}) {
  const token = await getAccessToken();
  try {
    const response = await axios.get(`${config.apiBase}${path}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, params });
    return response.data;
  } catch (err) {
    if (err.response?.status === 401) {
      _clearCache();
      const freshToken = await getAccessToken();
      const retry = await axios.get(`${config.apiBase}${path}`, { headers: { Authorization: `Zoho-oauthtoken ${freshToken}` }, params });
      return retry.data;
    }
    throw err;
  }
}

async function syncFieldMetadata() {
  console.log('[sync] Fetching field metadata from Zoho...'); // eslint-disable-line no-console
  let data;
  try {
    data = await zohoGet('/settings/fields', { module: 'Deals' });
  } catch (err) {
    console.error('[sync] No se pudo traer metadatos de campos en vivo:', err.message); // eslint-disable-line no-console
    const cached = await ZohoFieldMetadata.findAll();
    if (cached.length === 0) throw err;
    console.log(`[sync] Usando ${cached.length} campos guardados en DB (fallback)`); // eslint-disable-line no-console
    return cached.map((f) => ({
      api_name: f.api_name,
      field_label: f.field_label,
      data_type: f.data_type,
      section_name: f.section_name,
      custom_field: f.es_personalizado,
    }));
  }
  const fields = data.fields || [];

  const BATCH = 50;
  for (let i = 0; i < fields.length; i += BATCH) {
    await Promise.all(
      fields.slice(i, i + BATCH).map((field) =>
        ZohoFieldMetadata.upsert(
          {
            api_name: field.api_name,
            field_label: field.field_label,
            data_type: field.data_type,
            section_name: field.section_name || null,
            es_personalizado: field.custom_field || false,
          },
          { conflictFields: ['api_name'] }
        )
      )
    );
  }

  console.log(`[sync] Saved ${fields.length} field definitions`); // eslint-disable-line no-console
  return fields;
}

// Tipos que NO se pueden traer en el GET masivo.
const EXCLUDED_TYPES = ['subform', 'fileupload', 'ownerlookup', 'formula'];

function isInmuebleField(f) {
  const name = (f.api_name || '').toLowerCase();
  const label = (f.field_label || '').toLowerCase();
  return (
    name === 'torre' || name === 'torre_lista' || name === 'piso' || name === 'piso_lista' ||
    name === 'proyecto' || name === 'subproyecto' || name === 'nomenclatura_inmueble' ||
    name === 'destino_principal_inmueble' || name === 'inmueble' ||
    name === 'estado_del_inmueble_asociado_en_la_fiducia' ||
    label.includes('torre') || label.includes(' piso') || label.includes('nomenclatura') || label.includes('subproyecto')
  );
}

function isCotizacionField(f) {
  const name = (f.api_name || '').toLowerCase();
  const label = (f.field_label || '').toLowerCase();
  return (
    (label.includes('cotizaci') || label.includes('cuota') || label.includes('descuento') || label.includes('financiaci') ||
      name.includes('cotiz') || name.includes('cuota') || name.includes('descuento') || name.includes('financiaci')) &&
    !EXCLUDED_TYPES.includes(f.data_type)
  );
}

function isContactField(f) {
  const name = (f.api_name || '').toLowerCase();
  const label = (f.field_label || '').toLowerCase();
  return (
    (f.data_type === 'email' || f.data_type === 'phone' || name === 'email' || name === 'phone' ||
      name === 'secondary_email' || name === 'mobile' || name === 'fax' ||
      label === 'email' || label === 'phone' || label === 'mobile' ||
      label.includes('correo') || label.includes('teléfono') || label.includes('telefono')) &&
    !EXCLUDED_TYPES.includes(f.data_type)
  );
}

function buildFieldsList(fields) {
  // Referencia_de_Recaudo y Fecha_Vinculaci_n_Exitosa son las dos que deciden qué oportunidades se
  // sincronizan (ver esElegible): hay que pedirlas siempre, aunque el metadato no las clasifique.
  const baseFields = ['Deal_Name', 'Stage', 'Contact_Name', 'Account_Name', 'Amount', 'Fecha_Inicio_Plan_de_Pagos', CAMPO_REFERENCIA, CAMPO_FECHA_VINCULACION];
  const currencyFields = fields.filter((f) => f.data_type === 'currency').map((f) => f.api_name);
  const inmuebleFields = fields.filter((f) => isInmuebleField(f) && !EXCLUDED_TYPES.includes(f.data_type)).map((f) => f.api_name);
  const cotizacionFields = fields.filter((f) => isCotizacionField(f)).map((f) => f.api_name);
  const recaudoFields = fields
    .filter((f) => (f.field_label || '').toLowerCase().includes('recaudo') || (f.field_label || '').toLowerCase().includes('referencia'))
    .filter((f) => !EXCLUDED_TYPES.includes(f.data_type))
    .map((f) => f.api_name);
  const pagoSepFields = fields
    .filter((f) => {
      const label = (f.field_label || '').toLowerCase();
      const name = (f.api_name || '').toLowerCase();
      return (label.includes('pago') && label.includes('separac')) || (name.includes('pago') && name.includes('separac'));
    })
    .map((f) => f.api_name);
  const contactFields = fields.filter((f) => isContactField(f)).map((f) => f.api_name);
  const subformFields = ['Forma_de_Pago', 'Propuesta_de_Pago'];

  return [...new Set([...baseFields, ...currencyFields, ...inmuebleFields, ...cotizacionFields, ...recaudoFields, ...pagoSepFields, ...contactFields, ...subformFields])];
}

async function fetchDealsPage(fieldsList, page, modifiedSince = null) {
  const token = await getAccessToken();
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  if (modifiedSince) headers['If-Modified-Since'] = modifiedSince;
  const response = await axios.get(`${config.apiBase}/Deals`, { headers, params: { fields: fieldsList.join(','), per_page: 200, page } });
  return response.data;
}

// Zoho no dice cuántas oportunidades hay en total mientras se pagina. En un sync COMPLETO se usa como
// referencia lo que trajo el anterior (en memoria; 32.500 al arrancar el servidor, medido el 2026-10-14)
// para que la barra avance desde 0 y calcule el tiempo restante. Si se supera, la barra queda en ~99%.
let ultimoTotalDeals = 32500;

async function fetchAllDeals(fieldsList, modifiedSince = null) {
  const progreso = progresoSync('oportunidades');
  const estimado = modifiedSince ? null : ultimoTotalDeals;
  progreso.fase('Trayendo oportunidades de Zoho', estimado);
  const allDeals = [];
  let page = 1;
  let moreRecords = true;

  console.log(modifiedSince ? `[sync] Incremental sync — modified since: ${modifiedSince}` : '[sync] Full sync — fetching all deals'); // eslint-disable-line no-console

  while (moreRecords) {
    console.log(`[sync] Fetching deals page ${page}...`); // eslint-disable-line no-console
    progreso.etiqueta(`Trayendo oportunidades de Zoho (página ${page})`);
    try {
      const data = await fetchDealsPage(fieldsList, page, modifiedSince);
      if (data.status === 'error' || !data.data) {
        // Un sync COMPLETO que no recibe nada en la primera página no es 'sin cambios': es una respuesta
        // anómala de Zoho, y marcarlo exitoso dejaría el siguiente sync en modo incremental sobre una base vacía.
        if (!modifiedSince && page === 1) throw new Error('Zoho no devolvió oportunidades en el sync completo');
        break;
      }
      const deals = data.data || [];
      allDeals.push(...deals);
      if (estimado) progreso.establecer(allDeals.length, Math.max(estimado, allDeals.length + 200));
      else progreso.establecer(allDeals.length, null);
      moreRecords = data.info?.more_records === true;
      page += 1;
    } catch (err) {
      if (err.response?.status === 304) {
        console.log('[sync] No changes since last sync'); // eslint-disable-line no-console
        break;
      }
      throw err;
    }
  }

  if (!modifiedSince && allDeals.length > 0) ultimoTotalDeals = allDeals.length;
  return allDeals;
}

const SUBFORM_SKIP_KEYS = ['$in_merge', '$field_states', '$layout_id', '$permissions', 'Parent_Id', 'Created_Time', 'Modified_Time'];

function cleanSubformRow(row) {
  const clean = {};
  for (const [k, v] of Object.entries(row)) {
    if (!SUBFORM_SKIP_KEYS.includes(k) && v !== null && v !== undefined && v !== '') clean[k] = v;
  }
  return clean;
}

function mapDeal(deal, { currencyApiNames, inmuebleApiNames, cotizacionApiNames, recaudoField, pagoSepField, contactApiNames }) {
  const camposFinancieros = {};
  for (const apiName of currencyApiNames) if (deal[apiName] != null) camposFinancieros[apiName] = deal[apiName];

  const seccionInmueble = {};
  for (const apiName of inmuebleApiNames) if (deal[apiName] !== undefined) seccionInmueble[apiName] = deal[apiName];

  const seccionCotizacion = {};
  for (const apiName of cotizacionApiNames) if (deal[apiName] !== undefined) seccionCotizacion[apiName] = deal[apiName];

  const contactInfo = {};
  for (const apiName of contactApiNames) if (deal[apiName] != null && deal[apiName] !== '') contactInfo[apiName] = deal[apiName];

  const pagoSepValue = pagoSepField ? deal[pagoSepField.api_name] : null;

  return {
    zoho_id: deal.id,
    deal_name: deal.Deal_Name || 'Sin nombre',
    stage: deal.Stage || null,
    // `?.` sobre un valor que es literalmente `null` (typeof null === 'object'
    // en JS) da `undefined`, no `null` -- Prisma lo toleraba en el legado
    // (lo trata como "campo no provisto"), pero el driver pg de Sequelize
    // rechaza `undefined` en bind parameters ("has no value in the given
    // object"). `?? null` normaliza explícitamente.
    contact_name: (typeof deal.Contact_Name === 'object' ? deal.Contact_Name?.name : deal.Contact_Name) ?? null,
    contact_email: contactInfo.Email || contactInfo.email || null,
    contact_phone: contactInfo.Phone || contactInfo.phone || contactInfo.Mobile || null,
    contact_id: (typeof deal.Contact_Name === 'object' ? deal.Contact_Name?.id : null) ?? null,
    account_name: (typeof deal.Account_Name === 'object' ? deal.Account_Name?.name : deal.Account_Name) ?? null,
    referencia_recaudo: recaudoField && deal[recaudoField.api_name] != null ? String(deal[recaudoField.api_name]) : null,
    pago_separacion: pagoSepValue ? new Date(pagoSepValue) : null,
    fecha_inicio_plan_pagos: deal.Fecha_Inicio_Plan_de_Pagos ? new Date(deal.Fecha_Inicio_Plan_de_Pagos) : null,
    campos_financieros: Object.keys(camposFinancieros).length ? camposFinancieros : null,
    seccion_inmueble: Object.keys(seccionInmueble).length ? seccionInmueble : null,
    seccion_cotizacion: Object.keys(seccionCotizacion).length ? seccionCotizacion : null,
    forma_pago: Array.isArray(deal.Forma_de_Pago) && deal.Forma_de_Pago.length ? deal.Forma_de_Pago.map(cleanSubformRow) : null,
    propuesta_pago: Array.isArray(deal.Propuesta_de_Pago) && deal.Propuesta_de_Pago.length ? deal.Propuesta_de_Pago.map(cleanSubformRow) : null,
  };
}

// Upsert en SQL crudo (no el .upsert() de Sequelize) porque necesita
// semántica distinta a create vs update: en UPDATE, forma_pago/propuesta_pago
// NUNCA se sobrescriben con NULL (el GET masivo de Deals no los trae -- ver
// buildFieldsList -- así que pisarían el plan de pagos que el backfill ya
// cacheó); en CREATE sí se guardan tal cual (incluido NULL) para dejar el
// registro en el estado que espera el backfill.
//
// Bind parameters posicionales ($1, $2...), no `replacements` con nombre --
// bajo los lotes de 50 upserts concurrentes (Promise.all), los reemplazos
// con nombre de Sequelize (regex sobre el texto de la query, no bind real
// del driver) mezclaban valores entre llamadas paralelas que comparten el
// mismo texto de query ("Named replacement :accountName has no entry" con
// datos que sí lo tenían) -- bind posicional pasa directo al driver pg, sin
// ese parseo intermedio, y no tiene ese problema.
async function upsertOportunidad(data) {
  await sequelize.query(
    `INSERT INTO oportunidades (
       zoho_id, deal_name, stage, contact_name, contact_email, contact_phone, contact_id,
       account_name, referencia_recaudo, pago_separacion, fecha_inicio_plan_pagos,
       campos_financieros, seccion_inmueble, seccion_cotizacion, forma_pago, propuesta_pago,
       ultimo_sync_en, creado_en, actualizado_en
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11,
       $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb,
       now(), now(), now()
     )
     ON CONFLICT (zoho_id) DO UPDATE SET
       deal_name = EXCLUDED.deal_name,
       stage = EXCLUDED.stage,
       contact_name = EXCLUDED.contact_name,
       contact_email = EXCLUDED.contact_email,
       contact_phone = EXCLUDED.contact_phone,
       contact_id = EXCLUDED.contact_id,
       account_name = EXCLUDED.account_name,
       referencia_recaudo = EXCLUDED.referencia_recaudo,
       pago_separacion = EXCLUDED.pago_separacion,
       fecha_inicio_plan_pagos = EXCLUDED.fecha_inicio_plan_pagos,
       campos_financieros = EXCLUDED.campos_financieros,
       seccion_inmueble = EXCLUDED.seccion_inmueble,
       seccion_cotizacion = EXCLUDED.seccion_cotizacion,
forma_pago = COALESCE(EXCLUDED.forma_pago, oportunidades.forma_pago),
        propuesta_pago = COALESCE(EXCLUDED.propuesta_pago, oportunidades.propuesta_pago),
        ultimo_sync_en = now(),
       actualizado_en = now()`,
    {
      bind: [
        data.zoho_id,
        data.deal_name,
        data.stage,
        data.contact_name,
        data.contact_email,
        data.contact_phone,
        data.contact_id,
        data.account_name,
        data.referencia_recaudo,
        data.pago_separacion,
        data.fecha_inicio_plan_pagos,
        data.campos_financieros ? JSON.stringify(data.campos_financieros) : null,
        data.seccion_inmueble ? JSON.stringify(data.seccion_inmueble) : null,
        data.seccion_cotizacion ? JSON.stringify(data.seccion_cotizacion) : null,
        data.forma_pago ? JSON.stringify(data.forma_pago) : null,
        data.propuesta_pago ? JSON.stringify(data.propuesta_pago) : null,
      ],
    }
  );
}

// Regla de qué oportunidades entran (Jefe Gabriel, 2026-10-14): tienen Referencia de Recaudo O
// el campo "11, 12BC Fecha Vinculación Exitosa" diligenciado (antes: Pago Separación). Se evalúa
// sobre el valor del CAMPO, no sobre la etapa.
const CAMPO_REFERENCIA = 'Referencia_de_Recaudo';
const CAMPO_FECHA_VINCULACION = 'Fecha_Vinculaci_n_Exitosa';
const tieneValor = (v) => v !== null && v !== undefined && String(v).trim() !== '';
const esElegible = (deal, campoReferencia, campoFecha) =>
  tieneValor(deal[campoReferencia]) || tieneValor(deal[campoFecha]);

// El incremental (If-Modified-Since) solo trae lo modificado desde el último sync: con la regla
// nueva, oportunidades que ya cumplían y no se han tocado en Zoho nunca llegarían. Si el último
// sync exitoso es anterior a este cambio, el siguiente es completo (una sola vez).
// La fecha va DESPUÉS del último sync hecho con la regla vieja (el del programador de las 12:30 y varios
// incrementales de ese día): un 2026-10-14T05:00Z anterior dejaba pasar esos syncs como 'vigentes'.
const REGLA_NUEVA_DESDE = new Date('2026-10-14T21:10:00Z');

async function syncOportunidadesFromZoho(force = false) {
  const log = await SyncLog.create({ status: 'running' });
  const progreso = progresoSync('oportunidades');
  progreso.iniciar('Preparando la sincronización');

  try {
    const fields = await syncFieldMetadata();

    const pagoSepField = fields.find((f) => {
      const label = (f.field_label || '').toLowerCase();
      const name = (f.api_name || '').toLowerCase();
      return (label.includes('pago') && label.includes('separac')) || (name.includes('pago') && name.includes('separac'));
    });
    const campoReferencia = fields.find((f) => f.api_name === CAMPO_REFERENCIA)?.api_name ?? CAMPO_REFERENCIA;
    const campoFecha = fields.find((f) => f.api_name === CAMPO_FECHA_VINCULACION)?.api_name;
    if (!campoFecha) throw new Error('No se encontró el campo Fecha Vinculación Exitosa en los metadatos de Zoho');
    console.log(`[sync] Regla: ${campoReferencia} o ${campoFecha} con valor`); // eslint-disable-line no-console

    const currencyApiNames = fields.filter((f) => f.data_type === 'currency').map((f) => f.api_name);
    const inmuebleApiNames = fields.filter((f) => isInmuebleField(f) && !EXCLUDED_TYPES.includes(f.data_type)).map((f) => f.api_name);
    const cotizacionApiNames = fields.filter((f) => isCotizacionField(f)).map((f) => f.api_name);
    const recaudoField =
      fields.find((f) => (f.field_label || '').toLowerCase() === 'referencia de recaudo') ||
      fields.find((f) => (f.api_name || '').toLowerCase() === 'referencia_de_recaudo') ||
      fields.find((f) => (f.field_label || '').toLowerCase().includes('recaudo') && f.data_type === 'text');

    const fieldsList = buildFieldsList(fields);
    console.log(`[sync] Requesting ${fieldsList.length} fields per deal`); // eslint-disable-line no-console

    const lastSuccess = force ? null : await SyncLog.findOne({ where: { status: 'success' }, order: [['finalizado_en', 'DESC']] });
    const syncPrevioVigente = lastSuccess?.finalizado_en && new Date(lastSuccess.finalizado_en) >= REGLA_NUEVA_DESDE;
    const modifiedSince = syncPrevioVigente ? new Date(lastSuccess.finalizado_en).toUTCString() : null;

    const allDeals = await fetchAllDeals(fieldsList, modifiedSince);

    const deals = allDeals.filter((d) => esElegible(d, campoReferencia, campoFecha));
    console.log(`[sync] Fetched ${allDeals.length} deals total, ${deals.length} con Referencia de Recaudo o Fecha Vinculación Exitosa`); // eslint-disable-line no-console
    progreso.fase('Guardando oportunidades', deals.length);

    const contactApiNames = fields.filter((f) => isContactField(f) && !EXCLUDED_TYPES.includes(f.data_type)).map((f) => f.api_name);
    const fieldMap = { currencyApiNames, inmuebleApiNames, cotizacionApiNames, recaudoField, pagoSepField, contactApiNames };

    const BATCH_SIZE = 50;
    let saved = 0;
    for (let i = 0; i < deals.length; i += BATCH_SIZE) {
      const batch = deals.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((deal) => upsertOportunidad(mapDeal(deal, fieldMap))));
      saved += batch.length;
      progreso.establecer(saved);
      if (saved % 500 === 0 || saved === deals.length) {
        console.log(`[sync] Saved ${saved}/${deals.length} records...`); // eslint-disable-line no-console
      }
    }

    // Enriquecer contactos: email/telefono de los Contactos vinculados.
    const contactIds = [...new Set(deals.map((d) => (typeof d.Contact_Name === 'object' ? d.Contact_Name?.id : null)).filter(Boolean))];
    console.log(`[sync] Fetching contact details for ${contactIds.length} unique contacts...`); // eslint-disable-line no-console
    progreso.fase('Trayendo datos de contacto', contactIds.length);

    const CONTACT_FIELDS = 'Email,Phone,Mobile';
    const contactMap = {};
    for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
      const batch = contactIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((cid) => zohoGet(`/Contacts/${cid}`, { fields: CONTACT_FIELDS })));
      progreso.avanzar(batch.length);
      for (const r of results) {
        const c = r.status === 'fulfilled' ? r.value?.data?.[0] : null;
        if (c?.id) contactMap[c.id] = { email: c.Email || null, phone: c.Phone || c.Mobile || null };
      }
    }

    let enriched = 0;
    for (const deal of deals) {
      const cid = typeof deal.Contact_Name === 'object' ? deal.Contact_Name?.id : null;
      if (!cid || !contactMap[cid]) continue;
      const { email, phone } = contactMap[cid];
      if (!email && !phone) continue;
      await sequelize.query('UPDATE oportunidades SET contact_email = $1, contact_phone = $2 WHERE zoho_id = $3', {
        bind: [email, phone, deal.id],
      });
      enriched++;
    }
    console.log(`[sync] Enriched ${enriched} records with contact email/phone`); // eslint-disable-line no-console

    // Limpieza (solo en sync COMPLETO, que es el único que ve todas las oportunidades de Zoho): lo guardado
    // que ya no cumple la regla (p. ej. las que entraron solo por Pago Separación) se elimina. Guarda de
    // seguridad: no se borra nada si Zoho devolvió muy pocas oportunidades (respuesta truncada o con error).
    if (!modifiedSince && allDeals.length >= 1000 && deals.length > 0) {
      const vigentes = deals.map((d) => String(d.id));
      const [, resultado] = await sequelize.query('DELETE FROM oportunidades WHERE NOT (zoho_id = ANY($1::text[]))', { bind: [vigentes] });
      console.log(`[sync] Limpieza: ${resultado?.rowCount ?? 0} oportunidades eliminadas por no cumplir la regla`); // eslint-disable-line no-console
    }

    await log.update({ finalizado_en: new Date(), status: 'success', registros_sync: saved });
    console.log(`[sync] Done. ${saved} records synced.`); // eslint-disable-line no-console
    await recalcularVinculos().catch((e) => console.error('[vinculos] Error al recalcular:', e.message)); // eslint-disable-line no-console
    invalidarCacheDashboard();

    // Backfill de subforms en segundo plano -- el sync masivo nunca los trae
    // (ver buildFieldsList). No se espera, no debe bloquear la respuesta.
    runSubformsBackfill().catch((err) => console.error('[sync] Error en backfill de subforms automático:', err.message)); // eslint-disable-line no-console

    progreso.terminar();
    return { success: true, recordsSync: saved };
  } catch (err) {
    progreso.terminar();
    console.error('[sync] Error:', err.message); // eslint-disable-line no-console
    await log.update({ finalizado_en: new Date(), status: 'error', error_msg: err.message });
    return { success: false, error: err.message };
  }
}

module.exports = { syncOportunidadesFromZoho, syncFieldMetadata };
