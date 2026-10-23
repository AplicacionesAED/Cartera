// Módulo 'Otrosíes' (Baía Kristal, SOLO LECTURA). Ver
// otrosi.service.js#listOtrosi para la forma exacta de la respuesta.
import client, { API_BASE_URL } from './client';
import { toQuery } from './toQuery.js';

export function listOtrosies(params) {
  const { archivo: _archivo, ...resto } = params ?? {};
  return client.get(`/otrosies${toQuery(resto)}`);
}

export function listStagesOtrosi() {
  return client.get('/otrosies/stages');
}

// Check manual de "ya comparé este otrosí contra el CRM" (Jefe Gabriel,
// 2026-09-24) -- `verificado: false` también limpia quién/cuándo en el
// backend (ver otrosi.service.js#marcarVerificado).
export function marcarVerificadoOtrosi(id, verificado) {
  return client.patch(`/otrosies/${encodeURIComponent(id)}/verificado`, { verificado });
}

// Endpoint GET /otrosies/:id/archivo, devuelve el PDF directo -- probado en
// vivo (caso Mauro Cardone, archivo de 351296 bytes).
export function archivoOtrosieUrl(id) {
  return `${API_BASE_URL}/otrosies/${encodeURIComponent(id)}/archivo`;
}

// Sync manual + estado -- mismos endpoints que el patrón de Oportunidades
// (iniciarSyncOportunidades/getSyncStatusOportunidades en api/oportunidades.js).
export function iniciarSyncOtrosies() {
  return client.post('/otrosies/sync');
}

export function getSyncStatusOtrosies() {
  return client.get('/otrosies/sync/status');
}