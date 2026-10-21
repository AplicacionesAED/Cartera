// Copiado tal cual de zoho-payment-tracker/backend/src/baia-kristal/config/estadosOportunidad.js.
// Etapas (Stage) de Zoho que significan que el negocio se cayó. Una
// Oportunidad en cualquiera de estas etapas NUNCA debe proveer el plan de
// pagos vigente de un negocio, aunque su Referencia de Recaudo coincida con
// la de un negocio real.
const ESTADOS_DESISTIDOS = new Set([
  'DESISTIDO',
  'BACKOUT',
  'PREPARACION CARTA DESISTIMIENTO',
  'NO INTERESADO',
  'DESISTIDO EN APROBACION GERENCIA',
  'CARTA DESISTIMIENTO FIRMADA POR CLIENTE',
  'CARTA DESISTIMIENTO RADICADA',
]);

function esEtapaDesistida(stage) {
  return ESTADOS_DESISTIDOS.has(stage);
}

// Dado un grupo de Oportunidad que comparten la misma Referencia de Recaudo,
// elige cuál es "la" vigente: nunca una desistida si hay al menos una que no
// lo esté; si todas son desistidas (o todas vigentes), gana la de menor id.
function elegirOportunidadVigente(candidatas) {
  if (!candidatas || candidatas.length === 0) return null;
  const vigentes = candidatas.filter((o) => !esEtapaDesistida(o.stage));
  const pool = vigentes.length > 0 ? vigentes : candidatas;
  return [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

// Etapas cuyas oportunidades NO se guardan en la base (Jefe Gabriel, 2026-10-21): la sincronización las descarta y, si ya
// estaban guardadas, las borra. Se comparan sin distinguir mayúsculas ni espacios repetidos (Zoho escribe
// "4.1 EN ESTUDIO  DEMORADO" con dos espacios).
const ETAPAS_EXCLUIDAS = new Set(['BACKOUT', '4.1 EN ESTUDIO DEMORADO']);
const normalizarEtapa = (stage) => String(stage ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
const esEtapaExcluida = (stage) => ETAPAS_EXCLUIDAS.has(normalizarEtapa(stage));

module.exports = { ESTADOS_DESISTIDOS, ETAPAS_EXCLUIDAS, esEtapaDesistida, esEtapaExcluida, elegirOportunidadVigente };
