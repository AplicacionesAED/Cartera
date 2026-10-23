import client from './client';
import { toQuery } from './toQuery.js';

export function uploadFiducia(archivo) {
  const form = new FormData();
  form.append('archivo', archivo);
  return client.post('/fiducia/upload', form);
}

export function listEncargos(params) {
  return client.get(`/fiducia/encargos${toQuery(params)}`);
}

export function getEncargo(id) {
  return client.get(`/fiducia/encargos/${id}`);
}

export function getHoja(encargoId, hojaId, params) {
  return client.get(`/fiducia/encargos/${encargoId}/hojas/${hojaId}${toQuery(params)}`);
}

export function updateEncargo(id, data) {
  return client.patch(`/fiducia/encargos/${id}`, data);
}

export function removeEncargo(id) {
  return client.delete(`/fiducia/encargos/${id}`);
}

export function listMovimientos(params) {
  return client.get(`/fiducia/movimientos${toQuery(params)}`);
}

export function listPropietarios(params) {
  return client.get(`/fiducia/propietarios${toQuery(params)}`);
}

export function getNomenclaturas(encargoId, params) {
  return client.get(`/fiducia/encargos/${encargoId}/nomenclaturas${toQuery(params)}`);
}

export function getApartamentoDetalle(encargoId, referencia) {
  return client.get(`/fiducia/encargos/${encargoId}/negocio/${encodeURIComponent(referencia)}`);
}
