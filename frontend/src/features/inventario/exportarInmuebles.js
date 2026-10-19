// Exportar a Excel el listado de Inmuebles de Baía Kristal (Zoho). El usuario elige las columnas en el panel
// (components/ExportarColumnasPanel.jsx); por defecto solo la "Nomenclatura completa". Las columnas son las
// básicas del inmueble + TODAS las variables del Product de Zoho que existen en los inmuebles exportados
// (agrupadas por las mismas secciones del detalle; los campos de sistema que el detalle oculta no se ofrecen).
import { listInventario } from '../../api/inventario.js';
import { descargarExcelColumnas, traerTodasLasPaginas } from '../../utils/exportarExcelColumnas.js';
import {
  VARIABLES_OCULTAS, GRUPOS_ORDEN, GRUPOS_TITULOS, obtenerGrupoVariable, esVariableMoneda, etiquetaVariable,
} from './variablesInmueble.js';

const MONEDA = '"$" #,##0';

// Mismo criterio que la Nomenclatura completa del detalle y de Negocios: Proyecto + Torre + Piso + Unidad
// (la torre se omite si ya empieza por el proyecto).
export function nomenclaturaCompleta(item) {
  const torreRaw = item?.datos?.Block_Tower || item?.torre || null;
  const torre = torreRaw && (!item?.proyecto || !String(torreRaw).startsWith(String(item.proyecto))) ? String(torreRaw).trim() : null;
  const partes = [item?.proyecto, torre, item?.piso, item?.nombre].filter((v) => v != null && String(v).trim() !== '').map((v) => String(v).trim());
  return partes.length ? partes.join(' ') : null;
}

// "$ 150.000.000" / "150000000.00" / 150000000 -> número (o null si no es un monto).
function aMonto(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const coma = s.lastIndexOf(',');
  const n = coma !== -1 ? parseFloat(`${s.slice(0, coma).replace(/\./g, '')}.${s.slice(coma + 1)}`) : parseFloat(s.replace(/,/g, ''));
  return Number.isNaN(n) ? null : n;
}

// Valor de una variable de Zoho listo para una celda de Excel.
function valorVariable(key, v) {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? x.name || x.display_label || JSON.stringify(x) : String(x))).join(', ');
  if (typeof v === 'object') return v.name || v.display_label || JSON.stringify(v);
  if (esVariableMoneda(key)) return aMonto(v) ?? String(v);
  if (typeof v === 'number') return v;
  return String(v);
}

// Columnas básicas (siempre existen).
const COLUMNAS_BASE = [
  { key: 'nomenclaturaCompleta', header: 'NOMENCLATURA COMPLETA', width: 32, align: 'left', bold: true, valor: nomenclaturaCompleta },
  { key: 'proyecto', header: 'PROYECTO', width: 16, align: 'left', valor: (i) => i.proyecto ?? '' },
  { key: 'torre', header: 'TORRE', width: 22, align: 'left', valor: (i) => i.torre ?? '' },
  { key: 'piso', header: 'PISO', width: 10, align: 'center', valor: (i) => i.piso ?? '' },
  { key: 'nombre', header: 'UNIDAD', width: 12, align: 'left', valor: (i) => i.nombre ?? '' },
  { key: 'categoria', header: 'CATEGORÍA', width: 16, align: 'left', valor: (i) => i.categoria ?? '' },
  { key: 'estado', header: 'ESTADO', width: 14, align: 'center', estado: true, valor: (i) => i.estado ?? '' },
  { key: 'referenciaRecaudo', header: 'REFERENCIA DE RECAUDO', width: 22, align: 'left', valor: (i) => i.referenciaRecaudo ?? '' },
];

const claveVariable = (k) => `datos:${k}`;

// Columnas de las variables de Zoho que aparecen en al menos un inmueble de `items`.
function columnasVariables(items) {
  const keys = new Set();
  for (const it of items) for (const k of Object.keys(it.datos ?? {})) if (!VARIABLES_OCULTAS.has(k)) keys.add(k);
  return [...keys].map((k) => ({
    key: claveVariable(k),
    variable: k,
    header: etiquetaVariable(k).toUpperCase(),
    label: etiquetaVariable(k),
    width: Math.min(40, Math.max(14, etiquetaVariable(k).length + 4)),
    align: esVariableMoneda(k) ? undefined : 'left',
    numFmt: esVariableMoneda(k) ? MONEDA : undefined,
    valor: (it) => valorVariable(k, it.datos?.[k]),
  }));
}

// Todas las columnas disponibles para estos inmuebles, por sección.
function catalogo(items) {
  const porGrupo = Object.fromEntries(GRUPOS_ORDEN.map((g) => [g, []]));
  for (const c of columnasVariables(items)) porGrupo[obtenerGrupoVariable(c.variable)].push(c);
  for (const g of GRUPOS_ORDEN) porGrupo[g].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  return porGrupo;
}

export const cargarInmueblesBK = (filtros) => traerTodasLasPaginas(listInventario, filtros);

export function construirGruposBK(items) {
  const porGrupo = catalogo(items);
  const grupos = [{
    id: 'basicas',
    titulo: 'Datos básicos',
    columnas: COLUMNAS_BASE.map((c) => ({ key: c.key, label: c.header.charAt(0) + c.header.slice(1).toLowerCase() })),
  }];
  for (const g of GRUPOS_ORDEN) {
    if (porGrupo[g].length) grupos.push({ id: g, titulo: GRUPOS_TITULOS[g], columnas: porGrupo[g].map((c) => ({ key: c.key, label: c.label })) });
  }
  return grupos;
}

export async function exportarInmueblesBK(items, keys) {
  const disponibles = new Map([...COLUMNAS_BASE, ...Object.values(catalogo(items)).flat()].map((c) => [c.key, c]));
  const columnas = keys.map((k) => disponibles.get(k)).filter(Boolean);
  await descargarExcelColumnas({
    items,
    columnas,
    hoja: 'Inmuebles',
    nombreArchivo: `inmuebles-baia-kristal-${new Date().toISOString().slice(0, 10)}.xlsx`,
    columnaTotalEtiqueta: 'nomenclaturaCompleta',
    columnaTotalSuma: 'datos:Unit_Price',
  });
}
