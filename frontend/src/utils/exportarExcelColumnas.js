// Escribe y descarga un .xlsx a partir de una lista de columnas YA elegidas (ver
// features/inventario/ExportarInmueblesPage.jsx). Misma paleta que los demás Excel de la app: encabezado azul de
// marca, filas alternadas, Estado coloreado igual que `EstadoInventarioBadge`, fila de totales al final.
//
// Cada columna: { header, width, align?, numFmt?, bold?, estado?, enlace?, valor: (item) => any }
//   - estado: colorea la celda según el estado del inmueble.
//   - enlace: el valor es una URL y se escribe como hipervínculo ("Ver plano").
import ExcelJS from 'exceljs';
import { tonoEstadoFiduciaArgb } from './estadosFiducia.js';

const COLOR = {
  headerBg: 'FF1B21A6',
  headerTexto: 'FFFFFFFF',
  filaImparBg: 'FFF8FAFC',
  filaParBg: 'FFFFFFFF',
  totalBg: 'FFEEF1F5',
};

// Mismos tonos (fondo/texto) que `EstadoInventarioBadge`, como ARGB.
export function tonoEstado(estado) {
  const e = String(estado ?? '').toLowerCase();
  if (e.includes('dispon')) return { bg: 'FFECFDF5', ink: 'FF047857' };
  if (e.includes('vendid')) return { bg: 'FFF0F9FF', ink: 'FF0369A1' };
  if (e.includes('vip')) return { bg: 'FFFAF5FF', ink: 'FF7C3AED' };
  if (e.includes('reserv') || e.includes('separad') || e.includes('pend') || e.includes('stand')) return { bg: 'FFFFFBEB', ink: 'FFB45309' };
  return null;
}

export async function descargarExcelColumnas({ items, columnas, hoja = 'Inmuebles', nombreArchivo, columnaTotalEtiqueta, columnaTotalSuma }) {
  if (!items?.length) throw new Error('No hay inmuebles para exportar con los filtros actuales.');
  if (!columnas?.length) throw new Error('Elige al menos una columna.');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja);
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  columnas.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? 16; });

  const header = ws.getRow(1);
  columnas.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.fill = fill(COLOR.headerBg);
    cell.font = { bold: true, color: { argb: COLOR.headerTexto }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: c.align === 'left' ? 'left' : 'center', wrapText: true };
  });
  header.height = 30;

  items.forEach((item, idx) => {
    const row = ws.getRow(idx + 2);
    const bg = idx % 2 === 1 ? COLOR.filaImparBg : COLOR.filaParBg;
    columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const valor = c.valor(item);
      if (c.enlace) {
        cell.value = valor ? { text: 'Ver plano', hyperlink: valor } : '';
        cell.font = { color: { argb: 'FF232BED' }, underline: true };
      } else {
        cell.value = valor ?? '';
        if (c.bold) cell.font = { bold: true };
      }
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.alignment = { vertical: 'middle', horizontal: c.align ?? (typeof valor === 'number' ? 'right' : 'left') };
      cell.fill = fill(bg);
      if (c.estadoFiducia) {
        const tono = tonoEstadoFiduciaArgb(valor);
        cell.fill = fill(tono.bg);
        cell.font = { bold: true, color: { argb: tono.ink } };
      } else if (c.estado) {
        const tono = tonoEstado(valor);
        if (tono) {
          cell.fill = fill(tono.bg);
          cell.font = { bold: true, color: { argb: tono.ink } };
        }
      }
    });
  });

  // Fila de totales: cantidad de inmuebles (en la columna indicada, o la primera) y suma de la columna numérica indicada.
  const totalRow = ws.getRow(items.length + 2);
  columnas.forEach((_, i) => {
    const cell = totalRow.getCell(i + 1);
    cell.fill = fill(COLOR.totalBg);
    cell.font = { bold: true };
    cell.border = { top: { style: 'medium', color: { argb: 'FFC3CBD6' } } };
  });
  const iEtiqueta = Math.max(0, columnas.findIndex((c) => c.key === columnaTotalEtiqueta));
  totalRow.getCell(iEtiqueta + 1).value = `TOTAL: ${items.length} inmuebles`;
  totalRow.getCell(iEtiqueta + 1).alignment = { horizontal: 'left' };
  const iSuma = columnas.findIndex((c) => c.key === columnaTotalSuma);
  if (iSuma >= 0) {
    const suma = items.reduce((s, it) => {
      const v = columnas[iSuma].valor(it);
      return s + (typeof v === 'number' ? v : 0);
    }, 0);
    const cell = totalRow.getCell(iSuma + 1);
    cell.value = suma;
    if (columnas[iSuma].numFmt) cell.numFmt = columnas[iSuma].numFmt;
    cell.alignment = { horizontal: 'right' };
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: items.length + 1, column: columnas.length } };
  ws.views = [{ state: 'frozen', xSplit: iEtiqueta + 1, ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

// Trae TODAS las páginas de un listado (el backend topa en 200 por página).
export async function traerTodasLasPaginas(listar, filtros) {
  const todos = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await listar({ ...filtros, page, limit: 200 });
    todos.push(...(res.data.data ?? []));
    totalPages = res.data.pagination?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return todos;
}
