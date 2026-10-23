import client from './client';
import { toQuery } from './toQuery.js';

export function getStats() {
  return client.get('/negocios/stats');
}

export function getResumenStats() {
  return client.get('/negocios/resumen-stats');
}

export function getDashboardRecaudo(params) {
  return client.get(`/negocios/dashboard-recaudo${toQuery(params)}`);
}

export function getCarteraMora(params) {
  return client.get(`/negocios/cartera-mora${toQuery(params)}`);
}

export function getMesesResumen() {
  return client.get('/negocios/resumen-etapas/meses');
}

export function getResumenEtapas(mes) {
  return client.get(`/negocios/resumen-etapas${toQuery({ mes })}`);
}

export function cerrarMesAnterior() {
  return client.post('/negocios/resumen-etapas/cerrar-mes');
}
