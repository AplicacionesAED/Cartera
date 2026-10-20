// Traducción de la columna "Categoría" de los Excel de la fiducia a los frentes y torres del CRM (Proyecto_Torre).
// La categoría sola no basta (cada fideicomiso la escribe a su manera), así que se lee junto al fideicomiso (los
// primeros 5 dígitos de su nombre: "14607-P.A. INMOBILIARIO ..." -> 14607). Una categoría puede apuntar a VARIAS
// torres (p. ej. la 4 del fideicomiso 99203 es Kabo T4 y Privé T4): en ese caso la nomenclatura repetida se desempata
// por área, y si tampoco alcanza el negocio queda "Ambiguo" para que alguien lo decida.
//
// Se compara sin tildes, espacios ni símbolos (el CRM escribe "Kabo - Torre  4" con doble espacio).
const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const T = {
  kabo1: 'Kabo - Torre 1', kabo2: 'Kabo - Torre 2', kabo3: 'Kabo - Torre 3', kabo4: 'Kabo - Torre 4',
  prive1: 'Prive - Torre 1', prive2: 'Prive - Torre 2', prive3: 'Prive - Torre 3', prive4: 'Prive - Torre 4',
  kaliza1: 'Kaliza - Torre 1', kaliza2: 'Kaliza - Torre 2', kaliza3: 'Kaliza - Torre 3',
  kala1: 'Kala Golf - Torre 1', kala2: 'Kala Golf - Torre 2', kala3: 'Kala Golf - Torre 3', kala4: 'Kala Golf - Torre 4',
  vela1: 'Vela Village - Torre 1', plaza1: 'The Plaza - Torre 1', isla1: 'Isla Laguna - Torre 1',
};

// fideicomiso -> { categoría normalizada -> [torres] }; '*' = cualquier categoría de ese fideicomiso.
const TABLA = {
  '14607': { ET1KABOTR1: [T.kabo1], ET1KABOTR2: [T.kabo2], ET1PRIVETR2: [T.prive2], ET1PRIVETR3: [T.prive3] },
  '99203': { 3: [T.kabo3], 4: [T.kabo4, T.prive4], ETAPA1: [T.prive1] },
  '16037': { 1: [T.kaliza1], 2: [T.kaliza2, T.kala2], ET1: [T.kala1] },
  '16013': { '*': [T.vela1] },
  '16994': { '*': [T.plaza1] },
  '17664': { '*': [T.isla1] },
  '99289': { ET3: [T.kala3], ET4: [T.kala4] },
  '99306': { '*': [T.kaliza3] },
  // Vela C2 y C3: las unidades están en la Torre 1 (la Torre 2 está excluida del portafolio).
  '99331': { '*': [T.vela1] },
  '99332': { '*': [T.vela1] },
};

// Devuelve las torres (Proyecto_Torre normalizados) a las que apunta la categoría, o null si no hay traducción.
function torresDeCategoria(fideicomiso, categoria) {
  const codigo = String(fideicomiso ?? '').trim().slice(0, 5);
  const reglas = TABLA[codigo];
  if (!reglas) return null;
  const torres = reglas[norm(categoria)] ?? reglas['*'];
  return torres ? torres.map(norm) : null;
}

// Solo estas unidades están en el inventario del CRM; depósitos y parqueaderos no se vinculan.
const TIPOS_CON_INMUEBLE = new Set(['APARTAMENTO', 'SUITE', 'LOCAL']);

module.exports = { torresDeCategoria, TIPOS_CON_INMUEBLE };
