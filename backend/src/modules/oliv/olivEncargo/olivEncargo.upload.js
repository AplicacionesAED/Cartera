// Sube el Excel de movimientos de Oliv y lo guarda tal cual, columnas y
// filas crudas -- pedido explícito del usuario (2026-09-14): "todos los
// movimientos serán cargados mediante excel... dejemos listos esos módulos
// para que solo sea subir el excel". Mismo patrón de guardado genérico que
// fiducia.upload.js (Baía Kristal) -- Encargo/Hoja/Movimiento -- pero SIN
// su supuesto fijo "las primeras 6 filas son metadata, la fila 7 es el
// encabezado" (específico de la plantilla de esa fiduciaria). Acá el
// encabezado se **detecta automáticamente**: se busca, en las primeras 15
// filas de cada hoja, la primera que tenga una celda con alguna de las
// palabras ancla de `HEADER_ANCHOR_KEYS` -- confirmado con el primer Excel
// real de Oliv ("136043 - Saldos Acumulados por Concepto y Unidad.xlsx"),
// que trae 3 filas de título/metadata antes del encabezado real (fila 4:
// PROYECTO/ENCARGO/IDENTIFICACION/TITULAR/VALOR/COD_CONCEPTO/CONCEPTO/
// ESTADO/UNIDAD/CODIGO_UNIDAD/VALOR_UNIDAD/PROYECTO) -- "ENCARGO" es la
// ancla que la detecta. Si no encuentra ninguna ancla, cae a la fila 1. El
// parámetro `headerRow` sigue disponible para forzarlo a mano si algún
// Excel futuro no tiene ninguna de estas anclas.
//
// Las filas de "Rendimientos Brutos" (COD_CONCEPTO='RB') NUNCA se guardan
// como OlivMovimiento -- pedido explícito del usuario (2026-09-15): "esos
// movimientos no debe importarlos... solo los APORTES". La `OlivHoja` sí
// guarda el archivo completo tal cual (fiel al Excel subido); el filtro
// aplica solo a lo que se guarda como "movimiento".
const XLSX = require('xlsx');
const OlivEncargo = require('./olivEncargo.model');
const OlivHoja = require('./olivHoja.model');
const OlivMovimiento = require('./olivMovimiento.model');
const { esRendimientoBruto } = require('../../../utils/olivHelpers');
const { invalidarCacheResumenOliv } = require('../olivResumen/olivResumenCache');

const PROPIETARIO_KEYS = [
  'propietario', 'prop', 'cliente', 'client', 'nombre', 'name',
  'beneficiario', 'titular', 'copropietario', 'tercero', 'usuario',
  'comprador', 'adquirente', 'adquiriente',
];

function detectPropietarioKey(columnas) {
  const lower = columnas.map((c) => (c || '').toLowerCase().trim());
  for (const key of PROPIETARIO_KEYS) {
    const idx = lower.findIndex((c) => c === key || c.includes(key));
    if (idx !== -1) return idx;
  }
  return 0; // fallback: primera columna
}

const HEADER_ANCHOR_KEYS = ['encargo', 'referencia', 'propietario', 'titular'];

// 'YYYY-MM-DD' en la zona horaria LOCAL del proceso, NUNCA
// `new Date().toISOString()` (esa es UTC -- cerca de medianoche en
// America/Bogota, un día antes/después según la hora del server). Mismo
// gotcha de DATEONLY ya documentado en `configuracionFrente.service.js`,
// acá aplicado al default "si no mandan fecha, hoy".
function fechaHoyLocal() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function detectHeaderRow(raw2d) {
  const maxScan = Math.min(raw2d?.length ?? 0, 15);
  for (let i = 0; i < maxScan; i++) {
    const row = raw2d[i] || [];
    const tieneAncla = row.some((c) => HEADER_ANCHOR_KEYS.includes(String(c ?? '').trim().toLowerCase()));
    if (tieneAncla) return i;
  }
  return 0;
}

function extractColumnsAndRows(raw2d, headerRow) {
  if (!raw2d || raw2d.length <= headerRow) return { columnas: [], filas: [], totalFilas: 0 };
  const columnas = (raw2d[headerRow] || []).map((c) => (c != null ? String(c).trim() : ''));
  const filas = raw2d.slice(headerRow + 1).filter((row) => (Array.isArray(row) ? row : []).some((c) => c !== null && c !== '' && c !== undefined));
  return { columnas, filas, totalFilas: filas.length };
}

// `fecha` (Jefe Gabriel, 2026-09-24) es opcional en el request -- si no
// llega (o llega vacía), se completa con hoy. Es la fecha del Excel EN SÍ
// (una sola por Encargo, todos sus movimientos la comparten -- el Excel no
// trae fecha por fila, ver el comentario de cabecera del archivo), no algo
// que se le pida al usuario por cada movimiento.
async function procesarArchivoOliv(buffer, filename, { headerRow, fecha } = {}) {
  let sheetsMap;
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
    sheetsMap = {};
    for (const sheetName of workbook.SheetNames) {
      sheetsMap[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, blankrows: false, raw: false });
    }
  } catch {
    throw new Error(`No se pudo leer "${filename}" -- verifica que sea un Excel válido (.xlsx/.xls).`);
  }

  const encargo = await OlivEncargo.create({
    nombre: filename.replace(/\.[^.]+$/, ''),
    archivo_nombre: filename,
    fecha: fecha || fechaHoyLocal(),
  });
  const hojasCreadas = [];

  for (const [sheetName, raw2d] of Object.entries(sheetsMap)) {
    const resolvedHeaderRow = headerRow != null ? headerRow : detectHeaderRow(raw2d);
    const { columnas, filas, totalFilas } = extractColumnsAndRows(raw2d, resolvedHeaderRow);
    if (totalFilas === 0 && columnas.length === 0) continue;

    const hoja = await OlivHoja.create({ encargo_id: encargo.id, nombre_hoja: sheetName, columnas, filas, total_filas: totalFilas });
    const propietarioIdx = detectPropietarioKey(columnas);

    const filasMovimiento = filas
      .map((row) => {
        const datos = {};
        columnas.forEach((col, ci) => { if (col) datos[col] = row[ci] ?? null; });
        const propietario = row[propietarioIdx] ? String(row[propietarioIdx]).trim() : null;
        return { datos, propietario };
      })
      .filter(({ datos }) => !esRendimientoBruto(datos));

    const BATCH = 100;
    for (let i = 0; i < filasMovimiento.length; i += BATCH) {
      await OlivMovimiento.bulkCreate(
        filasMovimiento.slice(i, i + BATCH).map(({ datos, propietario }) => (
          { encargo_id: encargo.id, hoja_id: hoja.id, nombre_hoja: sheetName, propietario: propietario || null, datos }
        ))
      );
    }

    hojasCreadas.push({ id: hoja.id, nombreHoja: sheetName, totalFilas });
  }

  console.log(`[oliv-encargo] "${filename}" -> ${hojasCreadas.length} hojas, encargo ${encargo.id}`); // eslint-disable-line no-console

  // Invalida el cache del Resumen de Oliv -- un Excel nuevo cambia Aportes
  // (y ahora su fecha), así que la conciliación cacheada queda desactualizada.
  invalidarCacheResumenOliv();

  return { encargo, hojas: hojasCreadas };
}

module.exports = { procesarArchivoOliv };
