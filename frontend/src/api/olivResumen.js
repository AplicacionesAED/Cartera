// Resumen Gerencial de Oliv -- mismos endpoints que api/dashboard.js (Baía
// Kristal), renombrados de "-etapas" a "-torres" (ver
// backend/olivResumen.routes.js) porque Oliv agrupa por Torre, no por Etapa.
import client from './client';
import { toQuery } from './toQuery.js';

export function getResumenStatsOliv() {
  return client.get('/oliv/resumen/resumen-stats');
}

export function getDashboardRecaudoOliv(params) {
  return client.get(`/oliv/resumen/dashboard-recaudo${toQuery(params)}`);
}

export function getMesesResumenOliv() {
  return client.get('/oliv/resumen/resumen-torres/meses');
}

export function getResumenTorresOliv(mes) {
  return client.get(`/oliv/resumen/resumen-torres${toQuery({ mes })}`);
}

export function cerrarMesAnteriorOliv() {
  return client.post('/oliv/resumen/resumen-torres/cerrar-mes');
}

export function getCarteraMoraOliv(params) {
  return client.get(`/oliv/resumen/cartera-mora${toQuery(params)}`);
}
