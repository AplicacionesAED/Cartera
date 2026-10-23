// Exportar a Excel los movimientos de Oliv (mismos filtros de la pantalla) -- mismo estilo que el Excel de
// Movimientos de Baía Kristal (fiducia/MovimientosPage.jsx): encabezado azul de marca, primera fila fija y autofiltro.
import ExcelJS from 'exceljs';
import { formatDate } from '../../utils/format.js';
import { formatCelda } from '../../utils/formatCelda.js';

export async function exportarMovimientosOlivExcel(movimientos) {
  const datosKeys = [];
  const vistas = new Set();
  for (const mov of movimientos) {
    for (const k of Object.keys(mov.datos || {})) {
      if (!vistas.has(k)) { vistas.add(k); datosKeys.push(k); }
    }
  }

  const headers = ['Fecha', 'Encargo', 'Propietario', 'Concepto', 'Valor', 'Inmueble', 'Hoja', ...datosKeys];
  const filas = movimientos.map((mov) => [
    mov.fecha ? formatDate(mov.fecha) : '',
    mov.referencia ?? '',
    mov.propietario ?? '',
    mov.concepto ?? '',
    mov.valor ?? '',
    mov.inmueble ? (mov.inmueble.codigoUnidad ?? mov.inmueble.torre ?? '') : '',
    mov.nombreHoja ?? '',
    ...datosKeys.map((k) => formatCelda(k, mov.datos?.[k]) ?? ''),
  ]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Movimientos');
  ws.addRow(headers);
  filas.forEach((fila) => ws.addRow(fila));
  ws.getColumn(5).numFmt = '"$" #,##0';

  const encabezado = ws.getRow(1);
  encabezado.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF232BED' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle' };
  });
  encabezado.height = 20;

  headers.forEach((h, i) => {
    let maxLen = h.length;
    for (const fila of filas) maxLen = Math.max(maxLen, String(fila[i] ?? '').length);
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 4, 12), 60);
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `oliv-movimientos-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
