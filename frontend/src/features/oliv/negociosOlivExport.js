// Exportar el listado de Negocios de Oliv a CSV / Excel / PDF -- mismo menú y mismo estilo que
// negocios/negociosExport.js (Baía Kristal), con las columnas propias de Oliv.
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadCsv } from '../../utils/exportCsv.js';

function buildRows(negocios) {
  return negocios.map((n) => ({
    Unidad: n.unidad ?? '',
    Torre: n.torre ?? '',
    Referencia: n.referencia ?? '',
    Comprador: n.comprador ?? '',
    'Estado del negocio': n.estado ?? '',
    'Estado del inmueble': n.estadoInmueble ?? '',
    'Saldo actual': n.saldoActual != null ? Number(n.saldoActual) || 0 : '',
    Movimientos: n.totalMovimientos ?? 0,
  }));
}

export function exportNegociosOlivCsv(negocios, filename) {
  const rows = buildRows(negocios);
  const columns = Object.keys(rows[0] ?? {}).map((key) => ({ key, header: key }));
  downloadCsv(filename, rows, columns);
}

export function exportNegociosOlivExcel(negocios, filename) {
  const rows = buildRows(negocios);
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] ?? {}).map((k) => ({ wch: Math.max(k.length, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Negocios');
  XLSX.writeFile(wb, filename);
}

export function exportNegociosOlivPdf(negocios, filename) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const date = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const moneda = (v) => (v != null && v !== '' && Number(v) ? `$ ${Number(v).toLocaleString('es-CO')}` : '—');

  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text('Negocios de Oliv', 14, 14);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`${date} · ${negocios.length} registros`, 14, 20);

  autoTable(doc, {
    startY: 25,
    head: [['Unidad', 'Torre', 'Referencia', 'Comprador', 'Estado del negocio', 'Estado del inmueble', 'Saldo actual', 'Mov.']],
    body: negocios.map((n) => [
      n.unidad ?? '—',
      n.torre ?? '—',
      n.referencia ?? '—',
      n.comprador ?? '—',
      n.estado ?? '—',
      n.estadoInmueble ?? '—',
      moneda(n.saldoActual),
      n.totalMovimientos ?? 0,
    ]),
    styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [35, 43, 237], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [232, 233, 253] },
    columnStyles: { 6: { halign: 'right', cellWidth: 28 }, 7: { cellWidth: 12 } },
  });

  doc.save(filename);
}
