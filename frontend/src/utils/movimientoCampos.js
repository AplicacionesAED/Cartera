// Presentación de los campos de un movimiento fiduciario.
// "Referencia Movimiento" es, en realidad, la referencia de recaudo del inmueble: se muestra con ese nombre y sin el
// ".0000" que arrastra el Excel de la fiducia (ej. 1429635410107.0000 -> 1429635410107).
const ES_REFERENCIA = (key) => String(key || '').trim().toLowerCase() === 'referencia movimiento';

export function etiquetaCampoMovimiento(key) {
  return ES_REFERENCIA(key) ? 'Referencia de recaudo' : key;
}

export function valorCampoMovimiento(key, value) {
  if (!ES_REFERENCIA(key) || value == null) return value;
  return String(value).trim().replace(/\.0+$/, '');
}
