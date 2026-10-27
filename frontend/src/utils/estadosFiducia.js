// Un color por cada estado de fiducia (estado del negocio en la fiducia, más VIP del CRM y LIBRE). Se usa igual en
// Negocios, Inmuebles y en los Excel exportados, para que el mismo estado se vea siempre del mismo color.
const TONOS = {
  LIBRE: { bg: '#dbeafe', ink: '#1d4ed8' }, // azul
  OPCIONADO: { bg: '#d1fae5', ink: '#047857' }, // verde menta
  PROMETIDO: { bg: '#ecfccb', ink: '#4d7c0f' }, // verde lima
  VENDIDO: { bg: '#16a34a', ink: '#ffffff' }, // verde fuerte
  ESCRITURA_AUTORIZADA: { bg: '#cffafe', ink: '#0e7490' }, // turquesa
  EN_RETIRO: { bg: '#fed7aa', ink: '#c2410c' }, // naranja
  CEDIDO: { bg: '#fce7f3', ink: '#be185d' }, // rosa
  VIP: { bg: '#f3e8ff', ink: '#7c3aed' }, // violeta
};
const NEUTRO = { bg: '#f1f5f9', ink: '#475569' };

const clave = (estado) => String(estado ?? '').trim().toUpperCase().replace(/\s+/g, '_');

export function tonoEstadoFiducia(estado) {
  return TONOS[clave(estado)] ?? NEUTRO;
}

// Mismo tono como ARGB, para ExcelJS.
export function tonoEstadoFiduciaArgb(estado) {
  const { bg, ink } = tonoEstadoFiducia(estado);
  return { bg: `FF${bg.slice(1).toUpperCase()}`, ink: `FF${ink.slice(1).toUpperCase()}` };
}
