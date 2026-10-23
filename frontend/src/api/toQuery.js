// Arma el querystring de una petición. Un filtro de selección múltiple es un arreglo: se manda REPETIDO
// (?etapa=1&etapa=2) y el backend lo recibe como lista (ver backend utils/filtros.js#lista). Se omiten los
// valores vacíos y los arreglos sin elementos.
export function toQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (Array.isArray(value)) {
      value.filter((v) => v !== undefined && v !== null && v !== '').forEach((v) => qs.append(key, v));
    } else if (value !== undefined && value !== null && value !== '') {
      qs.set(key, value);
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}
