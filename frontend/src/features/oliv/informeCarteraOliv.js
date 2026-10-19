// Excel "Informe de Cartera" de Oliv, con el formato de la plantilla "PLANTILLA DE INFORMES DE CARTERA.xlsx"
// (Jefe Gabriel, 2026-10-19): título, encabezado en la fila 4 desde la columna B, y VALOR M2, CRÉDITO y % DE
// RECAUDO como FÓRMULAS de Excel (no valores fijos), más las dos notas al pie. Sin la columna ESTADO (se dejó
// fuera a propósito por ahora).
//
//   VALOR M2        = VALOR VENTA / ÁREA
//   CRÉDITO         = VALOR VENTA - CUOTA INICIAL
//   % DE RECAUDO    = VALOR ABONADO / VALOR VENTA
import ExcelJS from 'exceljs';

const COLOR = {
  headerBg: 'FF1B21A6',
  headerTexto: 'FFFFFFFF',
  filaImparBg: 'FFF8FAFC',
  filaParBg: 'FFFFFFFF',
  textoPendiente: 'FFB45309',
  textoVencido: 'FFDC2626',
};

// 'AAAA-MM-DD' o ISO -> Date a medianoche UTC del mismo día (Excel la muestra sin correr el día).
function aFecha(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// `formula` recibe las letras de las columnas de las que depende y la fila de Excel.
const COLUMNAS = [
  { key: 'unidad', header: 'NOMENCLATURA', width: 16, align: 'left', bold: true, valor: (f) => f.unidad ?? '' },
  { key: 'vista', header: 'VISTA', width: 14, align: 'left', valor: (f) => f.vista ?? '' },
  { key: 'encargo', header: 'ENCARGO', width: 16, align: 'left', valor: (f) => f.referenciaRecaudo ?? '' },
  { key: 'area', header: 'AREA', width: 10, numFmt: '#,##0.00', valor: (f) => num(f.area) },
  { key: 'propietarios', header: 'PROPIETARIOS', width: 34, align: 'left', valor: (f) => f.comprador ?? '' },
  { key: 'fechaContrato', header: 'FECHA CONTRATO', width: 16, numFmt: 'dd/mm/yyyy', valor: (f) => aFecha(f.fechaContrato) },
  { key: 'fechaUltPago', header: 'FECHA ULT. PAGO', width: 16, numFmt: 'dd/mm/yyyy', valor: (f) => aFecha(f.fechaSaldoContraentrega) },
  { key: 'valorVenta', header: 'VALOR VENTA', width: 18, numFmt: '#,##0', valor: (f) => num(f.valorInmueble) },
  { key: 'valorM2', header: 'VALOR M2', width: 16, numFmt: '#,##0', formula: (c, r) => `IFERROR(${c.valorVenta}${r}/${c.area}${r},"")` },
  { key: 'cuotaInicial', header: 'CUOTA INICIAL', width: 16, numFmt: '#,##0', valor: (f) => num(f.valorCuotaInicial) },
  { key: 'credito', header: 'CRÉDITO', width: 16, numFmt: '#,##0', formula: (c, r) => `${c.valorVenta}${r}-${c.cuotaInicial}${r}` },
  { key: 'valorAbonado', header: 'VALOR ABONADO', width: 16, numFmt: '#,##0', valor: (f) => num(f.totalAbonado) ?? 0 },
  { key: 'pctRecaudo', header: '% DE RECAUDO', width: 13, numFmt: '0.0%', formula: (c, r) => `IFERROR(${c.valorAbonado}${r}/${c.valorVenta}${r},"")` },
  { key: 'cuotasMora', header: 'CUOTAS MORA', width: 13, numFmt: '0', valor: (f) => num(f.cuotasEnMora) ?? 0 },
  { key: 'diasMora', header: 'DIAS MORA', width: 12, numFmt: '0', tono: 'warning', valor: (f) => num(f.maxDiasAtraso) ?? 0 },
  { key: 'valorVencido', header: 'VALOR VENCIDO', width: 16, numFmt: '#,##0', tono: 'danger', valor: (f) => num(f.montoEnMora) ?? 0 },
];

// Letra de columna de Excel (1 -> A). Los datos arrancan en la columna B (la A queda vacía, como en la plantilla).
const letra = (n) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

export async function descargarInformeCarteraOliv(filas, nombreArchivo) {
  const wb = new ExcelJS.Workbook();
  wb.calcProperties = { fullCalcOnLoad: true }; // Excel recalcula las fórmulas al abrir
  const ws = wb.addWorksheet('Informe de Cartera');
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  const PRIMERA = 2; // columna B
  const FILA_HEADER = 4;
  const letras = Object.fromEntries(COLUMNAS.map((c, i) => [c.key, letra(PRIMERA + i)]));

  ws.getColumn(1).width = 3;
  COLUMNAS.forEach((c, i) => { ws.getColumn(PRIMERA + i).width = c.width; });

  const titulo = ws.getCell(2, PRIMERA);
  titulo.value = 'INFORME DE CARTERA — OLIV';
  titulo.font = { bold: true, size: 14, color: { argb: COLOR.headerBg } };

  const header = ws.getRow(FILA_HEADER);
  COLUMNAS.forEach((c, i) => {
    const cell = header.getCell(PRIMERA + i);
    cell.value = c.header;
    cell.fill = fill(COLOR.headerBg);
    cell.font = { bold: true, color: { argb: COLOR.headerTexto }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: c.align === 'left' ? 'left' : 'center', wrapText: true };
  });
  header.height = 24;

  filas.forEach((fila, idx) => {
    const r = FILA_HEADER + 1 + idx;
    const row = ws.getRow(r);
    const bg = idx % 2 === 1 ? COLOR.filaImparBg : COLOR.filaParBg;
    COLUMNAS.forEach((c, i) => {
      const cell = row.getCell(PRIMERA + i);
      if (c.formula) {
        // El resultado en caché permite verlo bien aun antes de que Excel recalcule.
        const venta = num(fila.valorInmueble);
        const resultado = c.key === 'valorM2' ? num(fila.valorM2) : c.key === 'credito' ? num(fila.credito) : num(fila.pctRecaudo) != null ? num(fila.pctRecaudo) / 100 : null;
        cell.value = { formula: c.formula(letras, r), result: venta == null ? '' : resultado ?? '' };
      } else {
        cell.value = c.valor(fila) ?? '';
      }
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.alignment = { vertical: 'middle', horizontal: c.align === 'left' ? 'left' : c.numFmt && !c.numFmt.startsWith('dd') ? 'right' : 'center' };
      cell.fill = fill(bg);
      if (c.bold) cell.font = { bold: true };
      else if (c.tono === 'warning') cell.font = { color: { argb: COLOR.textoPendiente } };
      else if (c.tono === 'danger') cell.font = { color: { argb: COLOR.textoVencido } };
    });
  });

  const filaNotas = FILA_HEADER + filas.length + 2;
  const nota = (fila, texto) => {
    const cell = ws.getCell(fila, PRIMERA);
    cell.value = texto;
    cell.font = { italic: true, color: { argb: 'FF64748B' } };
  };
  nota(filaNotas, 'FECHA CONTRATO: Fecha en la que la oportunidad entró a Etapa 8 (vinculación exitosa) en HubSpot.');
  nota(filaNotas + 1, 'FECHA ULT PAGO: Fecha programada para el pago de la última cuota establecida en el plan de pagos, previa a la entrega del inmueble.');

  ws.views = [{ state: 'frozen', xSplit: PRIMERA, ySplit: FILA_HEADER }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
