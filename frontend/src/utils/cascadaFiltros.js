// Cascada Etapa -> Frente -> Torre con selección MÚLTIPLE en cada nivel. `opciones` es lo que devuelven los listados:
// { frentesDisponibles, frentesPorEtapa, torresPorFrente, torresPorEtapaFrente }.
const union = (listas) => [...new Set(listas.flat())];
const comoLista = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Frentes que se pueden elegir según las etapas marcadas (sin etapa marcada: todos).
export function frentesDisponibles(opciones, etapas) {
  const et = comoLista(etapas);
  if (et.length === 0) return opciones.frentesDisponibles ?? [];
  const nombres = union(et.map((e) => opciones.frentesPorEtapa?.[e] ?? []));
  return nombres.sort();
}

// Torres que se pueden elegir según las etapas y los frentes marcados (sin frente marcado: ninguna, como antes).
export function torresDisponibles(opciones, etapas, frentes) {
  const et = comoLista(etapas);
  const fr = comoLista(frentes);
  if (fr.length === 0) return [];
  const listas = fr.flatMap((f) => (et.length > 0 ? et.map((e) => opciones.torresPorEtapaFrente?.[`${e}||${f}`] ?? []) : [opciones.torresPorFrente?.[f] ?? []]));
  return union(listas).sort((a, b) => Number(a) - Number(b));
}

// Después de cambiar etapas/frentes, quita de la selección lo que ya no está disponible.
export function podarSeleccion(opciones, { etapa, frente, torre }) {
  const fre = comoLista(frente).filter((f) => frentesDisponibles(opciones, etapa).includes(f));
  const tor = comoLista(torre).filter((t) => torresDisponibles(opciones, etapa, fre).map(String).includes(String(t)));
  return { etapa: comoLista(etapa), frente: fre, torre: tor };
}
