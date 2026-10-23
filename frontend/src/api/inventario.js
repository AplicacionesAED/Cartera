import client from './client';
import { toQuery } from './toQuery.js';

export function listInventario(params) {
  return client.get(`/inventario${toQuery(params)}`);
}

export function getInventarioItem(id) {
  return client.get(`/inventario/${id}`);
}

export function iniciarSyncInventario() {
  return client.post('/inventario/sync');
}

export function getSyncStatusInventario() {
  return client.get('/inventario/sync/status');
}
