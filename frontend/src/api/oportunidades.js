import client from './client';

function toQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export function listOportunidades(params) {
  return client.get(`/oportunidades${toQuery(params)}`);
}

export function listStages() {
  return client.get('/oportunidades/stages');
}

export function getCamposMetadata() {
  return client.get('/oportunidades/campos/metadata');
}

export function getOportunidad(id) {
  return client.get(`/oportunidades/${id}`);
}

export function getSubformsOportunidad(id) {
  return client.get(`/oportunidades/${id}/subforms`);
}

// Vuelve a traer de Zoho el plan de pagos de esta oportunidad y reemplaza lo guardado.
export function refrescarSubformsOportunidad(id) {
  return client.post(`/oportunidades/${id}/subforms/refrescar`);
}

export function iniciarSyncOportunidades(full) {
  return client.post(`/oportunidades/sync${full ? '?full=true' : ''}`);
}

export function getSyncStatusOportunidades() {
  return client.get('/oportunidades/sync/status');
}

export function getSyncLogsOportunidades(limit = 5) {
  return client.get(`/oportunidades/sync/logs?limit=${limit}`);
}

export function iniciarBackfillSubforms() {
  return client.post('/oportunidades/backfill-subforms');
}

export function getBackfillSubformsStatus() {
  return client.get('/oportunidades/backfill-subforms/status');
}
