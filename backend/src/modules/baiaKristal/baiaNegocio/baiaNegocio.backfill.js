// Adaptado de la función runBackfill() que en el proyecto legado vivía
// directo en routes/negocios.js. Lee MovimientoFiduciario/HojaFiduciaria (ya
// migrados en la fase de Fiducia) y reconstruye Negocio/NegocioComprador/
// NegocioMovimiento desde cero -- destructivo a propósito (mismo criterio
// que el legado: "wipe existing Negocio data so we start fresh"), pensado
// para correr después de cada subida de Excel nueva o cuando cambie la
// lógica de parseo.
const { QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const HojaFiduciaria = require('../baiaFiducia/hojaFiduciaria.model');
const { excluirEnResumen } = require('../../../config/columnasExcluidas');
const { resolverColumnasMovPorPropietario, parseCompradoresCell, extraerDatosMovimiento } = require('./movPorPropietarioParser');
const Negocio = require('./baiaNegocio.model');
const NegocioComprador = require('./baiaNegocioComprador.model');
const NegocioMovimiento = require('./baiaNegocioMovimiento.model');
const { progresoSync, esCancelacion } = require('../../../utils/progresoSync');

// Cancelable mientras lee (aún no escribe nada); la escritura final es una sola transacción, todo o nada.
const progreso = progresoSync('negocios');
const { invalidarCacheDashboard } = require('../baiaDashboard/baiaDashboardCache');
const { recalcularVinculos } = require('../baiaVinculo/baiaVinculoResolver');

function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).replace(/[\r\n]/g, ' ').trim();
  return s === '' ? null : s;
}

function cleanRef(ref) {
  if (ref == null) return null;
  const s = String(ref).trim().replace(/\.0+$/, '');
  return s === '' ? null : s;
}

const MONTH_MAP = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };

function extractSaldoActual(datos) {
  if (!datos) return null;
  const direct = datos['Saldo Actual'];
  if (direct != null && direct !== '') {
    const n = parseFloat(String(direct).replace(/[^0-9.-]/g, ''));
    if (!isNaN(n)) return n;
  }
  const keys = Object.keys(datos).filter((k) => /^saldo\s+\w+\s+\d{4}$/i.test(k));
  let best = null, bestDate = null;
  for (const k of keys) {
    const parts = k.match(/^saldo\s+(\w+)\s+(\d{4})$/i);
    if (!parts) continue;
    const mo = MONTH_MAP[parts[1].toLowerCase().slice(0, 3)];
    if (mo === undefined) continue;
    const d = new Date(+parts[2], mo, 1);
    if (!bestDate || d > bestDate) {
      const v = datos[k];
      if (v != null && v !== '') {
        const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
        if (!isNaN(n)) { best = n; bestDate = d; }
      }
    }
  }
  return best;
}

// Busca la fila de encabezado real dentro de `filas` guardadas, buscando una
// columna conocida en un índice conocido. Cubre archivos donde el encabezado
// se coló dentro de `filas` en vez de quedar en `columnas`.
function findHeaderInStoredFilas(filas, knownCol, knownIdx) {
  for (let i = 0; i < Math.min(filas.length, 8); i++) {
    const row = filas[i] || [];
    if (cleanStr(row[knownIdx])?.toLowerCase() === knownCol.toLowerCase()) {
      return { headers: row.map((c) => cleanStr(c) ?? ''), dataRows: filas.slice(i + 1) };
    }
  }
  return null;
}

// "Última hoja" = la del correo más reciente (no la que se subió más tarde: una subida manual o un reproceso de un
// correo viejo no debe pisar estados y saldos más nuevos). Requiere `JOIN encargos_fiduciarios e ON e.id = h.encarg_id`.
const FECHA_HOJA = 'COALESCE(e.email_fecha, h.creado_en)';

let running = false;
let result = null;

// Reconstruye Negocios, Compradores y Movimientos desde las hojas de la fiducia.
//
// Diseño (2026-10-20): TODO se lee y se arma en memoria primero, sin tocar la base; recién al final, en UNA sola
// transacción, se vacían las tablas y se insertan los datos en lotes grandes. Así:
//   - es mucho más rápido (antes: por cada una de las ~740 hojas se borraban y volvían a crear los compradores de cada
//     negocio y se actualizaba la cédula comprador por comprador, contra una base remota; ahora son unos pocos
//     INSERT grandes);
//   - es atómico: si algo falla o se cancela, las tablas quedan EXACTAMENTE como estaban (antes un corte a mitad dejaba
//     negocios sin movimientos y los totales de recaudo se caían);
//   - se puede cancelar mientras se lee (la escritura final es corta y no se interrumpe).
// Reglas de combinación (idénticas a la versión anterior): el resumen de un negocio lo define la ÚLTIMA hoja
// "Movimientos" que lo trae; sus compradores, la última hoja "Mov_Por_Propietario" que trae alguno (si ninguna, los de
// la celda Propietarios del resumen); un movimiento (por ID Movimiento) se guarda una sola vez, el de la primera hoja.
async function runBackfill() {
  if (running) return;
  running = true;
  result = null;
  const startedAt = Date.now();
  progreso.iniciar('Preparando la reconstrucción');

  try {
    const hojaIds = await sequelize.query(
      `SELECT h.id, h.nombre_hoja, e.codigo FROM hojas_fiduciarias h JOIN encargos_fiduciarios e ON e.id = h.encarg_id
       WHERE h.nombre_hoja IN ('Movimientos', 'Mov_Por_Propietario')
       ORDER BY ${FECHA_HOJA} ASC, h.id ASC`,
      { type: QueryTypes.SELECT }
    );

    // ── Fase 1: hoja "Movimientos" -> Negocio.datos + estado ──────────────
    const hojasFase1 = hojaIds.filter((h) => h.nombre_hoja === 'Movimientos');
    const resumenMap = new Map();
    // DESVINCULADO: una referencia que no viene en la última hoja "Movimientos" de su fideicomiso (la fiducia dejó de
    // reportarla). `ultimaHojaPorCodigo` guarda la última hoja leída de cada código (las hojas vienen por fecha ASC) y cada
    // referencia, la última hoja que la trajo. Los marcadores de unidad libre (referencia con '*') no son negocios.
    const ultimaHojaPorCodigo = new Map();
    progreso.fase('Leyendo los resúmenes de la fiducia', hojasFase1.length);
    for (const hojaRef of hojasFase1) {
      progreso.verificar(); // todavía no se escribió nada en la base: cancelar es seguro
      progreso.avanzar(1);
      const hoja = await HojaFiduciaria.findByPk(hojaRef.id, { attributes: ['columnas', 'filas'] });
      const filas = Array.isArray(hoja.filas) ? hoja.filas : [];
      const storedCols = Array.isArray(hoja.columnas) ? hoja.columnas : [];

      let headers, dataRows;
      const found = findHeaderInStoredFilas(filas, 'Referencia', 7);
      if (found) {
        ({ headers, dataRows } = found);
      } else if (storedCols.findIndex((c) => (c || '').toLowerCase().trim() === 'referencia') === 7) {
        headers = storedCols.map((c) => cleanStr(c) ?? '');
        dataRows = filas;
      } else {
        console.warn('[backfill] Resumen: header row not found'); // eslint-disable-line no-console
        continue;
      }
      ultimaHojaPorCodigo.set(hojaRef.codigo, hojaRef.id);
      const estadoIdx = headers.findIndex((h) => h.toLowerCase() === 'estado');
      const propietariosIdx = headers.findIndex((h) => h.toLowerCase() === 'propietarios');

      for (const row of dataRows) {
        const referencia = cleanRef(cleanStr(row[7]));
        if (!referencia) continue;
        const estado = estadoIdx !== -1 ? cleanStr(row[estadoIdx]) : null;
        const datos = {};
        headers.forEach((col, idx) => {
          if (!col || excluirEnResumen(col)) return;
          const v = cleanStr(row[idx]);
          if (v !== null) datos[col] = v;
        });
        const saldoActual = extractSaldoActual(datos);
        const propietariosRaw = propietariosIdx !== -1 ? row[propietariosIdx] : null;

        const existing = resumenMap.get(referencia);
        if (!existing) {
          resumenMap.set(referencia, { estado, datos, saldoActual, propietariosRaw, codigo: hojaRef.codigo, hojaId: hojaRef.id });
        } else {
          existing.estado = estado;
          existing.datos = datos;
          existing.saldoActual = saldoActual;
          existing.codigo = hojaRef.codigo;
          existing.hojaId = hojaRef.id;
          if (!existing.propietariosRaw && propietariosRaw) existing.propietariosRaw = propietariosRaw;
        }
      }
    }

    // Negocios en memoria: referencia -> { estado, datos, saldoActual, compradores[] }
    const negocios = new Map();
    for (const [referencia, data] of resumenMap) {
      const comps = data.propietariosRaw ? parseCompradoresCell(data.propietariosRaw, null, null) : [];
      negocios.set(referencia, {
        estado: data.estado,
        datos: data.datos,
        saldoActual: data.saldoActual,
        desvinculado: !referencia.includes('*') && data.hojaId !== ultimaHojaPorCodigo.get(data.codigo),
        compradores: comps.map((c, i) => ({ nombre: c.nombre, nroId: c.nroId, porcentaje: c.porcentaje, orden: i })),
      });
    }

    // ── Fase 2: hojas "Mov_Por_Propietario" -> compradores + movimientos ──
    // Cada hoja pesa ~4,5 MB como JSON y son ~740 (≈3,3 GB): traerlas todas por una conexión remota tardaba horas. En
    // lugar de eso la BASE hace el trabajo pesado y solo se trae lo que cuenta:
    //   - movimientos: una fila por ID Movimiento (la de la primera hoja que lo trae), ~48 mil filas en total;
    //   - compradores: para cada negocio, las filas de la ÚLTIMA hoja que trae propietarios para él.
    const hojasFase2 = hojaIds.filter((h) => h.nombre_hoja === 'Mov_Por_Propietario');
    progreso.fase('Analizando las hojas de movimientos', hojasFase2.length);
    progreso.verificar();
    const cabeceras = await sequelize.query(
      `SELECT h.id, h.columnas FROM hojas_fiduciarias h JOIN encargos_fiduciarios e ON e.id = h.encarg_id
       WHERE h.nombre_hoja = 'Mov_Por_Propietario' ORDER BY ${FECHA_HOJA} ASC, h.id ASC`,
      { type: QueryTypes.SELECT }
    );
    // Hojas agrupadas por la posición de sus columnas (normalmente es una sola disposición para todas).
    const grupos = new Map();
    for (const c of cabeceras) {
      const idx = resolverColumnasMovPorPropietario(Array.isArray(c.columnas) ? c.columnas : []);
      const clave = JSON.stringify(idx);
      if (!grupos.has(clave)) grupos.set(clave, { idx, ids: [] });
      grupos.get(clave).ids.push(c.id);
    }

    const movimientos = new Map(); // id_movimiento -> fila (la primera hoja gana)
    const entradasComp = new Map(); // referencia -> { compradores: Map }
    const entero = (n) => Number.isInteger(n) && n >= 0;
    let hechas = 0;
    progreso.fase('Leyendo movimientos y compradores', cabeceras.length);
    for (const { idx, ids } of grupos.values()) {
      progreso.verificar();
      if (![idx.negRefIdx, idx.idMovIdx, idx.propIdx].every(entero)) continue;
      const ref = `f.fila->>${idx.negRefIdx}`;
      const idMov = `f.fila->>${idx.idMovIdx}`;
      const prop = `f.fila->>${idx.propIdx}`;
      const desde = `FROM hojas_fiduciarias h JOIN encargos_fiduciarios e ON e.id = h.encarg_id CROSS JOIN LATERAL jsonb_array_elements(h.filas) WITH ORDINALITY AS f(fila, pos) WHERE h.id = ANY($1::int[])`;

      // Movimientos: una fila por ID Movimiento (la de la primera hoja, y dentro de ella la primera posición).
      const filasMov = await sequelize.query(
        `SELECT DISTINCT ON (${idMov}) f.fila ${desde} AND NULLIF(btrim(${idMov}), '') IS NOT NULL
         ORDER BY ${idMov}, ${FECHA_HOJA} ASC, h.id ASC, f.pos ASC`,
        { bind: [ids], type: QueryTypes.SELECT }
      );
      for (const { fila } of filasMov) {
        const referencia = cleanRef(cleanStr(fila[idx.negRefIdx]));
        if (!referencia) continue;
        const mov = extraerDatosMovimiento(fila, idx);
        if (mov && !movimientos.has(mov.idMovimiento)) movimientos.set(mov.idMovimiento, { ...mov, referencia });
      }
      progreso.verificar();

      // Compradores: por cada referencia, la última hoja que trae propietarios y TODAS sus filas de esa referencia.
      const ultimas = await sequelize.query(
        `SELECT DISTINCT ON (${ref}) ${ref} AS ref, h.id AS hoja ${desde} AND NULLIF(btrim(${prop}), '') IS NOT NULL AND NULLIF(btrim(${ref}), '') IS NOT NULL
         ORDER BY ${ref}, ${FECHA_HOJA} DESC, h.id DESC`,
        { bind: [ids], type: QueryTypes.SELECT }
      );
      if (ultimas.length > 0) {
        const filasComp = await sequelize.query(
          `SELECT f.fila ${desde} AND (h.id, ${ref}) IN (SELECT * FROM unnest($2::int[], $3::text[]))
           ORDER BY ${FECHA_HOJA} ASC, h.id ASC, f.pos ASC`,
          { bind: [ids, ultimas.map((u) => u.hoja), ultimas.map((u) => u.ref)], type: QueryTypes.SELECT }
        );
        for (const { fila } of filasComp) {
          const referencia = cleanRef(cleanStr(fila[idx.negRefIdx]));
          if (!referencia) continue;
          if (!entradasComp.has(referencia)) entradasComp.set(referencia, { compradores: new Map() });
          const entry = entradasComp.get(referencia);
          const comps = parseCompradoresCell(fila[idx.propIdx], fila[idx.nroIdIdx], idx.pctIdx !== -1 ? fila[idx.pctIdx] : null);
          for (const comp of comps) {
            const byId = comp.nroId ? entry.compradores.get(comp.nroId) : undefined;
            const byName = entry.compradores.get(comp.nombre);
            if (byId) {
              // ya conocido por cedula
            } else if (byName) {
              if (comp.nroId) {
                entry.compradores.delete(comp.nombre);
                entry.compradores.set(comp.nroId, { ...byName, nroId: comp.nroId });
              }
            } else {
              const key = comp.nroId || comp.nombre;
              entry.compradores.set(key, { ...comp, orden: entry.compradores.size });
            }
          }
        }
      }
      hechas += ids.length;
      progreso.establecer(hechas);
    }

    for (const [referencia, entry] of entradasComp) {
      let neg = negocios.get(referencia);
      if (!neg) {
        neg = { estado: null, datos: null, saldoActual: null, compradores: [] };
        negocios.set(referencia, neg);
      }
      const lista = [...entry.compradores.values()];
      if (lista.length > 0) neg.compradores = lista.map((c) => ({ nombre: c.nombre, nroId: c.nroId, porcentaje: c.porcentaje, orden: c.orden }));
    }
    // Un movimiento de un negocio que no estaba en ningún resumen igual crea el negocio (como antes).
    for (const m of movimientos.values()) {
      if (!negocios.has(m.referencia)) negocios.set(m.referencia, { estado: null, datos: null, saldoActual: null, compradores: [] });
    }

    // ── Escritura: una sola transacción (todo o nada) ─────────────────────
    // A partir de aquí ya no se puede cancelar (es corta y no debe dejar nada a medias).
    progreso.fase('Guardando los negocios', negocios.size);
    // Las marcas manuales (en trámite / canje, ver negocio.service.js#updateFlags) no vienen del Excel: se guardan antes de
    // vaciar la tabla y se devuelven al final, para que reconstruir (ahora a diario y sin que nadie lo mire) no las borre.
    const marcasManuales = await sequelize.query('SELECT referencia, en_tramite, es_canje FROM negocios WHERE en_tramite OR es_canje', { type: QueryTypes.SELECT });

    let totalComp = 0;
    await sequelize.transaction(async (t) => {
      // TRUNCATE simple (por tabla) falla en Postgres si otra tabla la referencia por FK: se truncan las tres juntas.
      await sequelize.query('TRUNCATE TABLE negocio_movimientos, negocio_compradores, negocios', { transaction: t });

      const LOTE = 500;
      const referencias = [...negocios.keys()];
      const idPorReferencia = new Map();
      for (let i = 0; i < referencias.length; i += LOTE) {
        const lote = referencias.slice(i, i + LOTE).map((referencia) => {
          const n = negocios.get(referencia);
          return { referencia, estado: n.estado, datos: n.datos, saldo_actual: n.saldoActual, desvinculado: n.desvinculado === true };
        });
        const creados = await Negocio.bulkCreate(lote, { transaction: t, returning: ['id', 'referencia'] });
        for (const c of creados) idPorReferencia.set(c.referencia, c.id);
        progreso.establecer(Math.min(i + LOTE, referencias.length));
      }

      progreso.fase('Guardando compradores', referencias.length);
      const filasComp = [];
      for (const [referencia, n] of negocios) {
        for (const c of n.compradores) {
          filasComp.push({ negocio_id: idPorReferencia.get(referencia), nombre: c.nombre, nro_id: c.nroId ?? null, porcentaje: c.porcentaje ?? null, orden: c.orden });
        }
      }
      for (let i = 0; i < filasComp.length; i += 1000) {
        await NegocioComprador.bulkCreate(filasComp.slice(i, i + 1000), { transaction: t });
        progreso.establecer(Math.min(i + 1000, filasComp.length));
      }
      totalComp = filasComp.length;

      progreso.fase('Guardando movimientos', movimientos.size);
      const filasMov = [...movimientos.values()].map((m) => ({
        negocio_id: idPorReferencia.get(m.referencia), referencia: m.referencia, id_movimiento: m.idMovimiento, fecha_contable: m.fechaContable ?? null, datos: m.datos,
      }));
      for (let i = 0; i < filasMov.length; i += 1000) {
        await NegocioMovimiento.bulkCreate(filasMov.slice(i, i + 1000), { transaction: t });
        progreso.establecer(Math.min(i + 1000, filasMov.length));
      }

      for (const m of marcasManuales) {
        await Negocio.update({ en_tramite: m.en_tramite, es_canje: m.es_canje }, { where: { referencia: m.referencia }, transaction: t });
      }
    });

    const total = negocios.size;
    const desvinculados = [...negocios.values()].filter((n) => n.desvinculado).length;
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    result = { ok: true, negocios: total, desvinculados, compradores: totalComp, movimientos: movimientos.size, elapsed: `${elapsed}s` };
    console.log(`[backfill] Listo: ${total} negocios (${desvinculados} desvinculados), ${totalComp} compradores, ${movimientos.size} movimientos en ${elapsed}s`); // eslint-disable-line no-console
    // Los negocios se reconstruyeron: se vuelve a decidir a qué inmueble corresponde cada uno.
    await recalcularVinculos().catch((e) => console.error('[vinculos] Error al recalcular:', e.message)); // eslint-disable-line no-console
    invalidarCacheDashboard();
  } catch (err) {
    if (esCancelacion(err)) {
      result = { ok: false, cancelada: true, error: 'Cancelada: no se modificó nada, los negocios quedaron como estaban.' };
      console.log('[backfill] Cancelada por el usuario (sin cambios en la base)'); // eslint-disable-line no-console
    } else {
      result = { ok: false, error: err.message };
      console.error('[backfill] Error (la base quedó como estaba):', err.message); // eslint-disable-line no-console
    }
  } finally {
    progreso.terminar();
    running = false;
  }
}

function isBackfillRunning() {
  return running;
}

function getBackfillResult() {
  return result;
}

const getBackfillProgreso = () => progreso.snapshot();

module.exports = { runBackfill, isBackfillRunning, getBackfillResult, getBackfillProgreso };
