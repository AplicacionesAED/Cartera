// Exportar a Excel el listado de Inmuebles de Oliv. El usuario elige las columnas en el panel
// (components/ExportarColumnasPanel.jsx); por defecto solo la "Nomenclatura completa". Recorre TODAS las
// páginas del listado respetando los filtros activos del panel -- sin filtros son todos los inmuebles.
import { listInmueblesOliv } from '../../api/oliv.js';
import { descargarExcelColumnas, traerTodasLasPaginas } from '../../utils/exportarExcelColumnas.js';

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// "Oliv LIVA Piso 1 101": proyecto + torre + piso + unidad. En Oliv el código de unidad ya trae la torre
// ("LIVA - 101"), así que se le quita para no repetirla.
export function nomenclaturaCompletaOliv(i) {
  const torre = i.torre ? String(i.torre).trim() : '';
  let unidad = i.codigoUnidad ? String(i.codigoUnidad).trim() : '';
  if (torre && unidad.toUpperCase().startsWith(`${torre.toUpperCase()} -`)) unidad = unidad.slice(torre.length + 2).trim();
  const piso = i.piso != null && String(i.piso).trim() !== '' ? `Piso ${String(i.piso).trim()}` : '';
  return [i.proyecto, torre, piso, unidad].filter((p) => p && String(p).trim() !== '').join(' ') || null;
}

const MONEDA = '"$" #,##0';
const AREA = '#,##0.00';

// Catálogo de columnas por sección (orden = orden del Excel).
export const GRUPOS_OLIV = [
  {
    id: 'identificacion',
    titulo: 'Identificación',
    columnas: [
      { key: 'nomenclaturaCompleta', header: 'NOMENCLATURA COMPLETA', width: 28, align: 'left', bold: true, valor: nomenclaturaCompletaOliv },
      { key: 'proyecto', header: 'PROYECTO', width: 14, align: 'left', valor: (i) => i.proyecto ?? '' },
      { key: 'torre', header: 'TORRE', width: 9, align: 'center', valor: (i) => i.torre ?? '' },
      { key: 'piso', header: 'PISO', width: 8, align: 'center', valor: (i) => (num(i.piso) ?? i.piso ?? '') },
      { key: 'codigoUnidad', header: 'NOMENCLATURA', width: 18, align: 'left', valor: (i) => i.codigoUnidad ?? '' },
      { key: 'categoria', header: 'CATEGORÍA', width: 14, align: 'left', valor: (i) => i.categoria ?? '' },
      { key: 'tipoApartamento', header: 'TIPO DE APARTAMENTO', width: 20, align: 'left', valor: (i) => i.tipoApartamento ?? '' },
    ],
  },
  {
    id: 'estado',
    titulo: 'Estado',
    columnas: [
      { key: 'estado', header: 'ESTADO', width: 14, align: 'center', estado: true, valor: (i) => i.estado ?? '' },
    ],
  },
  {
    id: 'areas',
    titulo: 'Áreas y dimensiones',
    columnas: [
      { key: 'areaConstruida', header: 'ÁREA CONSTRUIDA (M²)', width: 14, numFmt: AREA, valor: (i) => num(i.areaConstruida) },
      { key: 'areaPrivada', header: 'ÁREA PRIVADA (M²)', width: 14, numFmt: AREA, valor: (i) => num(i.areaPrivada) },
      { key: 'areaTerraza', header: 'ÁREA DE TERRAZA (M²)', width: 14, numFmt: AREA, valor: (i) => num(i.areaTerraza) },
    ],
  },
  {
    id: 'caracteristicas',
    titulo: 'Características',
    columnas: [
      { key: 'alcobas', header: 'ALCOBAS', width: 10, numFmt: '0', valor: (i) => num(i.alcobas) },
      { key: 'banos', header: 'BAÑOS', width: 9, numFmt: '0', valor: (i) => num(i.banos) },
      { key: 'tipoVista', header: 'TIPO DE VISTA', width: 16, align: 'left', valor: (i) => i.tipoVista ?? '' },
    ],
  },
  {
    id: 'financiero',
    titulo: 'Información financiera',
    columnas: [
      { key: 'valorComercial', header: 'VALOR COMERCIAL', width: 18, numFmt: MONEDA, valor: (i) => num(i.valorComercial) },
      { key: 'valorM2', header: 'VALOR POR M²', width: 16, numFmt: MONEDA, valor: (i) => num(i.valorM2) },
      { key: 'bono', header: 'BONO', width: 15, numFmt: MONEDA, valor: (i) => num(i.bono) },
    ],
  },
  {
    id: 'documentos',
    titulo: 'Documentos y sistema',
    columnas: [
      { key: 'planoLink', header: 'PLANO', width: 12, align: 'center', enlace: true, valor: (i) => i.planoLink ?? '' },
      { key: 'idUnidad', header: 'ID DE UNIDAD', width: 14, align: 'left', valor: (i) => i.idUnidad ?? '' },
      { key: 'ultimoSyncEn', header: 'ÚLTIMA SINCRONIZACIÓN', width: 22, align: 'left', valor: (i) => (i.ultimoSyncEn ? new Date(i.ultimoSyncEn).toLocaleString('es-CO') : '') },
    ],
  },
];

export const COLUMNAS_OLIV_POR_KEY = Object.fromEntries(GRUPOS_OLIV.flatMap((g) => g.columnas).map((c) => [c.key, c]));

// Panel: carga los inmuebles con los filtros activos, y arma las secciones (solo con las columnas del catálogo).
export const cargarInmueblesOliv = (filtros) => traerTodasLasPaginas(listInmueblesOliv, filtros);
export const construirGruposOliv = () => GRUPOS_OLIV.map((g) => ({ id: g.id, titulo: g.titulo, columnas: g.columnas.map((c) => ({ key: c.key, label: c.header.charAt(0) + c.header.slice(1).toLowerCase() })) }));

export async function exportarInmueblesOliv(items, keys) {
  const columnas = keys.map((k) => COLUMNAS_OLIV_POR_KEY[k]).filter(Boolean).map((c) => ({ ...c }));
  await descargarExcelColumnas({
    items,
    columnas: columnas.map((c) => ({ ...c, key: c.key })),
    hoja: 'Inmuebles',
    nombreArchivo: `oliv-inmuebles-${new Date().toISOString().slice(0, 10)}.xlsx`,
    columnaTotalEtiqueta: 'nomenclaturaCompleta',
    columnaTotalSuma: 'valorComercial',
  });
}
