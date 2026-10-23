// Filtros de selección múltiple: el frontend manda cada filtro repetido (?etapa=1&etapa=2); Express lo entrega como
// arreglo cuando hay varios y como texto cuando hay uno solo. `lista()` lo normaliza siempre a un arreglo de textos
// no vacíos (sin valor = []), que significa "sin filtro".
function lista(valor) {
  if (valor === undefined || valor === null || valor === '') return [];
  return (Array.isArray(valor) ? valor : [valor]).map((v) => String(v)).filter((v) => v !== '');
}

// Filtro en cascada Etapa -> Frente -> Torre sobre filas ya calculadas en memoria (con campos etapa/frente/torre).
// OR dentro de cada nivel; las torres solo acotan junto a frentes. Sin selección = sin filtro.
function filtrarCascadaEnMemoria(filas, { etapa, frente, torre }) {
  const etapas = lista(etapa);
  const frentes = lista(frente);
  const torres = lista(torre);
  return filas.filter((f) => {
    if (etapas.length && !etapas.includes(f.etapa)) return false;
    if (frentes.length && !frentes.includes(f.frente)) return false;
    if (frentes.length && torres.length && !torres.includes(f.torre)) return false;
    return true;
  });
}

module.exports = { lista, filtrarCascadaEnMemoria };
