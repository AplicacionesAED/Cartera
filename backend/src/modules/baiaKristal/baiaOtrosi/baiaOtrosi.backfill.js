// Backfill de verificación del fileupload `Otro_si_Contrato_Fiducia` para el
// módulo de SOLO LECTURA 'Otrosíes' (Baía Kristal, Cartera v2).
//
// POR QUÉ no se puebla desde el sync bulk: Meredith confirmó que pedir ese
// campo fileupload en una consulta bulk/lista de Zoho da FALSOS NEGATIVOS
// reales (dice 'sin archivo' cuando sí lo tiene, nunca al revés -- ver
// hive/reports/baia-kristal-otrosi-contrato-fiducia.md). La única fuente
// confiable es el GET individual por Deal (`/Deals/{id}` con ese campo).
//
// CRITERIO DE ALCANCE (decisión del Jefe Gabriel, 2026-09-23 -- ninguno de los
// criterios por categoría es seguro: hubo casos con archivo=No que sí cargaron
// documento y otros con requerido='No' con archivo real; nada puede excluir a
// alguien PARA SIEMPRE). La corrida normal procesa por RECENCIA:
//    otro_si_archivo_verificado_en IS NULL  (nunca chequeado)
//   OR
//    otro_si_archivo_verificado_en < ahora - VIGENCIA_HORAS (default 24h)
// sin mirar `otro_si_tiene_archivo` ni `otro_si_requerido` actuales. Todo se
// re-verifica tarde o temprano; solo se evita re-chequear lo verificado hace
// poco. `force=true` ignora la recencia (barrido completo). El estado de
// recencia se resetea en cada verificación (se escribe `otro_si_archivo_verificado_en`).
//
// CONCURRENCIA: elevada a 12 (probada contra límites de rate de Zoho, se baja
// si aparecen 429 -- ver decisión de god 20:04). Escribe SOLO
// `otro_si_tiene_archivo` + `otro_si_archivo_verificado_en`. Con 6664
// registros ronda los ~12-15 min en background con la concurrencia actual.
// NUNCA escribe a Zoho, solo lee.
const axios = require('axios');
const { Op } = require('sequelize');
const { getAccessToken } = require('../../../utils/zohoAuth');
const zohoConfig = require('../../../config/zoho');
const Otrosi = require('./baiaOtrosi.model');

let running = false;
let result = null;

const CAMPO_ARCHIVO = 'Otro_si_Contrato_Fiducia';
const CONCURRENCIA = 12;
const PAUSA_MS = 120;
// Vigencia de una verificación: pasado ese tiempo un registro vuelve a entrar
// en la corrida normal. Ajustable por env (horas), default 24.
const VIGENCIA_HORAS = Number(process.env.OTROSI_BACKFILL_VIGENCIA_HORAS || 24);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// El fileupload de Zoho viene como array de objetos (o un solo objeto) con los
// metadatos del archivo -- vacío/null/'' significa que no tiene archivo.
function tieneArchivo(valor) {
  if (valor == null) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === 'object') return Object.keys(valor).length > 0;
  return String(valor).trim() !== '';
}

async function verificarDeal(zohoDealId) {
  const token = await getAccessToken();
  const response = await axios.get(`${zohoConfig.apiBase}/Deals/${zohoDealId}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    params: { fields: CAMPO_ARCHIVO },
  });
  const deal = response.data?.data?.[0] || {};
  return tieneArchivo(deal[CAMPO_ARCHIVO]);
}

async function runOtrosiBackfill(force = false) {
  if (running) return;
  running = true;
  result = null;
  const startedAt = Date.now();
  let procesadas = 0;
  let actualizadas = 0;
  let sinArchivo = 0;
  let errores = 0;

  function reportarProgreso(total) {
    const elapsedMs = Date.now() - startedAt;
    const porcentaje = total > 0 ? Math.round((procesadas / total) * 100) : 100;
    const promedioMsPorItem = procesadas > 0 ? elapsedMs / procesadas : null;
    const restantes = total - procesadas;
    const segundosRestantesEstimados = promedioMsPorItem != null ? Math.round((promedioMsPorItem * restantes) / 1000) : null;
    result = { running: true, total, procesadas, porcentaje, actualizadas, sinArchivo, errores, segundosTranscurridos: Math.round(elapsedMs / 1000), segundosRestantesEstimados };
  }

  try {
    // Criterio normal: por RECENCIA (nunca verificado o con verificación
    // vencida). Nada de filtros por `otro_si_tiene_archivo` ni `otro_si_requerido`.
    const where = force
      ? {}
      : {
          [Op.or]: [
            { otro_si_archivo_verificado_en: null },
            { otro_si_archivo_verificado_en: { [Op.lt]: new Date(Date.now() - VIGENCIA_HORAS * 3600 * 1000) } },
          ],
        };
    const pendientes = await Otrosi.findAll({
      where,
      attributes: ['id', 'zoho_deal_id'],
      order: [['zoho_deal_id', 'ASC']],
    });

    reportarProgreso(pendientes.length);

    for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
      const lote = pendientes.slice(i, i + CONCURRENCIA);
      const resultados = await Promise.allSettled(lote.map((item) => verificarDeal(item.zoho_deal_id)));

      for (let j = 0; j < resultados.length; j++) {
        const r = resultados[j];
        const item = lote[j];
        if (r.status === 'fulfilled') {
          const tiene = r.value === true;
          if (!tiene) sinArchivo++;
          await item.update({ otro_si_tiene_archivo: tiene, otro_si_archivo_verificado_en: new Date() });
          actualizadas++;
        } else {
          errores++;
          console.error(`[otrosiBackfill] Error en ${item.zoho_deal_id}:`, r.reason?.message || r.reason); // eslint-disable-line no-console
        }
        procesadas++;
      }

      reportarProgreso(pendientes.length);
      if (procesadas % 50 === 0 || procesadas === pendientes.length) {
        console.log(`[otrosiBackfill] Progreso: ${procesadas}/${pendientes.length} (${actualizadas} ok, ${errores} errores)`); // eslint-disable-line no-console
      }
      if (i + CONCURRENCIA < pendientes.length) await sleep(PAUSA_MS);
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    result = { ok: true, total: pendientes.length, actualizadas, sinArchivo, errores, elapsed: `${elapsed}s` };
    console.log(`[otrosiBackfill] Listo: ${actualizadas}/${pendientes.length} en ${elapsed}s (${errores} errores)`); // eslint-disable-line no-console
  } catch (err) {
    result = { ok: false, error: err.message };
    console.error('[otrosiBackfill] Error fatal:', err.message); // eslint-disable-line no-console
  } finally {
    running = false;
  }
}

function isOtrosiBackfillRunning() {
  return running;
}

function getOtrosiBackfillResult() {
  return result;
}

module.exports = { runOtrosiBackfill, isOtrosiBackfillRunning, getOtrosiBackfillResult };