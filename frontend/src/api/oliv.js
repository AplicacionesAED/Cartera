import client from './client';

function toQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export function getStatusOportunidadesOliv() {
  return client.get('/oliv/oportunidades/status');
}

export function listOportunidadesOliv(params) {
  return client.get(`/oliv/oportunidades${toQuery(params)}`);
}

export function listStagesOportunidadesOliv() {
  return client.get('/oliv/oportunidades/stages');
}

export function getOportunidadOliv(id) {
  return client.get(`/oliv/oportunidades/${id}`);
}

export function iniciarSyncOportunidadesOliv(full = false) {
  return client.post(`/oliv/oportunidades/sync${full ? '?full=true' : ''}`);
}

export function getSyncStatusOportunidadesOliv() {
  return client.get('/oliv/oportunidades/sync/status');
}

export function listPropiedadesMetadataOliv() {
  return client.get('/oliv/oportunidades/propiedades/metadata');
}

// ─── Inmuebles (objeto "Unidades" de HubSpot) ───

export function listInmueblesOliv(params) {
  return client.get(`/oliv/inmuebles${toQuery(params)}`);
}

export function getInmuebleOliv(id) {
  return client.get(`/oliv/inmuebles/${id}`);
}

export function iniciarSyncInmueblesOliv(full = false) {
  return client.post(`/oliv/inmuebles/sync${full ? '?full=true' : ''}`);
}

export function getSyncStatusInmueblesOliv() {
  return client.get('/oliv/inmuebles/sync/status');
}

// ─── Negocios (vista compuesta: Oportunidad + Inmueble + cotización aceptada) ───

export function listNegociosOliv(params) {
  return client.get(`/oliv/negocios${toQuery(params)}`);
}

export function getNegocioOliv(id) {
  return client.get(`/oliv/negocios/${id}`);
}

// ─── Encargos y Movimientos (Excel crudo -- ver backend/olivEncargo, sin
// columnas conocidas todavía, pedido explícito del usuario 2026-09-14) ───

// `fecha` es opcional (Jefe Gabriel, 2026-09-24) -- si no se manda, el
// backend la completa con hoy (ver olivEncargo.upload.js).
export function uploadEncargoOliv(archivo, fecha) {
  const form = new FormData();
  form.append('archivo', archivo);
  if (fecha) form.append('fecha', fecha);
  return client.post('/oliv/encargos/upload', form);
}

export function listEncargosOliv(params) {
  return client.get(`/oliv/encargos${toQuery(params)}`);
}

export function getEncargoOliv(id) {
  return client.get(`/oliv/encargos/${id}`);
}

export function getHojaOliv(encargoId, hojaId, params) {
  return client.get(`/oliv/encargos/${encargoId}/hojas/${hojaId}${toQuery(params)}`);
}

export function updateEncargoOliv(id, data) {
  return client.patch(`/oliv/encargos/${id}`, data);
}

export function removeEncargoOliv(id) {
  return client.delete(`/oliv/encargos/${id}`);
}

export function listMovimientosOliv(params) {
  return client.get(`/oliv/encargos/movimientos${toQuery(params)}`);
}

export function listPropietariosOliv(params) {
  return client.get(`/oliv/encargos/propietarios${toQuery(params)}`);
}
