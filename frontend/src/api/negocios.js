import client from './client';

function toQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export function listNegocios(params) {
  return client.get(`/negocios${toQuery(params)}`);
}

export function getNegocio(id) {
  return client.get(`/negocios/${encodeURIComponent(id)}`);
}

export function getMovimientosNegocio(id, params) {
  return client.get(`/negocios/${encodeURIComponent(id)}/movimientos${toQuery(params)}`);
}

// Vista global de "Movimientos Fiduciarios" (todos los movimientos, con
// contexto de negocio) -- ver MovimientosPage.jsx en features/fiducia/.
export function listMovimientosNegocios(params) {
  return client.get(`/negocios/movimientos${toQuery(params)}`);
}

export function exportMovimientosNegocios(params) {
  return client.get(`/negocios/movimientos/export${toQuery(params)}`);
}

export function updateFlagsNegocio(negocioId, data) {
  return client.patch(`/negocios/${negocioId}/flags`, data);
}

export function iniciarBackfillNegocios() {
  return client.post('/negocios/backfill');
}

export function getBackfillStatusNegocios() {
  return client.get('/negocios/backfill/status');
}
