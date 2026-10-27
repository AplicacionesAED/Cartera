// Un color por cada estado de fiducia (estado del negocio en la fiducia, más VIP del CRM y LIBRE). Se usa igual en
// Negocios, Inmuebles y en los Excel exportados, para que el mismo estado se vea siempre del mismo color.
const TONOS = {
  LIBRE: { bg: '#ecfdf5', ink: '#047857' }, // esmeralda
  OPCIONADO: { bg: '#fffbeb', ink: '#b45309' }, // ámbar
  PROMETIDO: { bg: '#e8e9fd', ink: '#232bed' }, // azul de marca
  VENDIDO: { bg: '#e0f7f4', ink: '#0f766e' }, // verde azulado
  ESCRITURA_AUTORIZADA: { bg: '#dcfce7', ink: '#166534' }, // verde oscuro
  EN_RETIRO: { bg: '#ffedd5', ink: '#c2410c' }, // naranja
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
