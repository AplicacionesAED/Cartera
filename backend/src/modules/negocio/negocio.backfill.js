// Adaptado de la función runBackfill() que en el proyecto legado vivía
// directo en routes/negocios.js. Lee MovimientoFiduciario/HojaFiduciaria (ya
// migrados en la fase de Fiducia) y reconstruye Negocio/NegocioComprador/
// NegocioMovimiento desde cero -- destructivo a propósito (mismo criterio
// que el legado: "wipe existing Negocio data so we start fresh"), pensado
// para correr después de cada subida de Excel nueva o cuando cambie la
// lógica de parseo.
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../config/db');
const HojaFiduciaria = require('../fiducia/hojaFiduciaria.model');
const { excluirEnResumen } = require('../../config/columnasExcluidas');
const { resolverColumnasMovPorPropietario, parseCompradoresCell, extraerDatosMovimiento } = require('./movPorPropietarioParser');
const Negocio = require('./negocio.model');
const NegocioComprador = require('./negocioComprador.model');
const NegocioMovimiento = require('./negocioMovimiento.model');
const { progresoSync } = require('../../utils/progresoSync');

const progreso = progresoSync('negocios');
const { invalidarCacheDashboard } = require('../dashboard/dashboardCache');
const { recalcularVinculos } = require('../vinculo/vinculoResolver');

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

// Corre `fn` sobre `items` en lotes concurrentes -- contra una base remota
// el cuello de botella es la latencia de ida y vuelta de cada query, no el
// trabajo en sí, así que paralelizar dentro del lote da una mejora enorme.
async function runBatched(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
  }
}

// Prisma en el legado podía ignorar nroId en createMany silenciosamente;
// esta función se conserva por fidelidad aunque en Sequelize bulkCreate sí
// lo respeta -- no hace daño y deja la migración a prueba de esa clase de bug.
async function applyNroIdRaw(negocioId, list) {
  for (const c of list) {
    if (!c.nroId) continue;
    await sequelize.query('UPDATE negocio_compradores SET nro_id = $1 WHERE negocio_id = $2::integer AND nombre = $3', {
      bind: [c.nroId, negocioId, c.nombre],
    });
  }
}

let running = false;
let result = null;

async function runBackfill() {
  if (running) return;
  running = true;
  result = null;
  const startedAt = Date.now();
  let marcasManuales = [];
  progreso.iniciar('Preparando la reconstrucción');

  try {
    // Las marcas manuales (en trámite / canje, ver negocio.service.js#updateFlags) no vienen del
    // Excel: se guardan antes de vaciar la tabla y se devuelven al final, para que reconstruir
    // (ahora a diario y sin que nadie lo mire, ver programador.js) no las borre.
    marcasManuales = await sequelize.query(
      'SELECT referencia, en_tramite, es_canje FROM negocios WHERE en_tramite OR es_canje',
      { type: QueryTypes.SELECT }
    );
    // TRUNCATE simple (por tabla) falla en Postgres si otra tabla la
    // referencia por FK, sin importar que ya este vacia -- hay que truncar
    // las tres juntas en un solo statement (o con CASCADE).
    await sequelize.query('TRUNCATE TABLE negocio_movimientos, negocio_compradores, negocios');

    const hojaIds = await HojaFiduciaria.findAll({
      where: { nombre_hoja: { [Op.in]: ['Movimientos', 'Mov_Por_Propietario'] } },
      attributes: ['id', 'nombre_hoja'],
      order: [['creado_en', 'ASC']],
    });

    // ── Fase 1: hoja "Movimientos" -> Negocio.datos + estado ──────────────
    const hojasFase1 = hojaIds.filter((h) => h.nombre_hoja === 'Movimientos');
    const resumenMap = new Map();
    progreso.fase('Leyendo los resúmenes de la fiducia', hojasFase1.length);
    for (const hojaRef of hojasFase1) {
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
          resumenMap.set(referencia, { estado, datos, saldoActual, propietariosRaw });
        } else {
          existing.estado = estado;
          existing.datos = datos;
          existing.saldoActual = saldoActual;
          if (!existing.propietariosRaw && propietariosRaw) existing.propietariosRaw = propietariosRaw;
        }
      }
    }

    const resumenEntries = [...resumenMap.entries()];
    progreso.fase('Creando negocios', resumenEntries.length);
    await runBatched(resumenEntries, 20, async ([referencia, data]) => {
      progreso.avanzar(1);
      const [negocio] = await Negocio.upsert(
        { referencia, estado: data.estado, datos: data.datos, saldo_actual: data.saldoActual },
        { conflictFields: ['referencia'] }
      );

      if (data.propietariosRaw) {
        const comps = parseCompradoresCell(data.propietariosRaw, null, null);
        if (comps.length > 0) {
          const existingComps = await NegocioComprador.count({ where: { negocio_id: negocio.id } });
          if (existingComps === 0) {
            await NegocioComprador.bulkCreate(
              comps.map((c, i) => ({ negocio_id: negocio.id, nombre: c.nombre, nro_id: c.nroId, porcentaje: c.porcentaje, orden: i }))
            );
            await applyNroIdRaw(negocio.id, comps);
          }
        }
      }
    });

    // ── Fase 2: hoja "Mov_Por_Propietario" -> compradores + movimientos ───
    const hojasFase2 = hojaIds.filter((h) => h.nombre_hoja === 'Mov_Por_Propietario');
    progreso.fase('Cargando compradores y movimientos', hojasFase2.length);
    for (const hojaRef of hojasFase2) {
      progreso.avanzar(1);
      const hoja = await HojaFiduciaria.findByPk(hojaRef.id, { attributes: ['columnas', 'filas'] });
      const filas = Array.isArray(hoja.filas) ? hoja.filas : [];
      const storedCols = Array.isArray(hoja.columnas) ? hoja.columnas : [];
      const idx = resolverColumnasMovPorPropietario(storedCols);

      const negMap = new Map();
      for (const row of filas) {
        const referencia = cleanRef(cleanStr(row[idx.negRefIdx]));
        if (!referencia) continue;

        if (!negMap.has(referencia)) negMap.set(referencia, { compradores: new Map(), movimientos: [] });
        const entry = negMap.get(referencia);

        const comps = parseCompradoresCell(row[idx.propIdx], row[idx.nroIdIdx], idx.pctIdx !== -1 ? row[idx.pctIdx] : null);
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

        const mov = extraerDatosMovimiento(row, idx);
        if (mov) entry.movimientos.push({ ...mov, referencia });
      }

      const negMapEntries = [...negMap.entries()];
      const referenciasHoja = negMapEntries.map(([r]) => r);
      const idsMovHoja = negMapEntries.flatMap(([, entry]) => entry.movimientos.map((m) => m.idMovimiento));

      const [existingNegocios, existingMovIds] = await Promise.all([
        Negocio.findAll({ where: { referencia: { [Op.in]: referenciasHoja } }, attributes: ['id', 'referencia'] }),
        idsMovHoja.length > 0
          ? NegocioMovimiento.findAll({ where: { id_movimiento: { [Op.in]: idsMovHoja } }, attributes: ['id_movimiento'] })
          : [],
      ]);
      const negocioByRef = new Map(existingNegocios.map((n) => [n.referencia, n]));
      const existingMovSet = new Set(existingMovIds.map((m) => m.id_movimiento));

      let compCount = 0, movCount = 0;
      await runBatched(negMapEntries, 20, async ([referencia, entry]) => {
        let neg = negocioByRef.get(referencia);
        if (!neg) {
          neg = await Negocio.create({ referencia });
          negocioByRef.set(referencia, neg);
        }

        const list = [...entry.compradores.values()];
        if (list.length > 0) {
          await NegocioComprador.destroy({ where: { negocio_id: neg.id } });
          await NegocioComprador.bulkCreate(list.map((c) => ({ negocio_id: neg.id, nombre: c.nombre, nro_id: c.nroId, porcentaje: c.porcentaje, orden: c.orden })));
          await applyNroIdRaw(neg.id, list);
          compCount += list.length;
        }

        const toInsert = entry.movimientos.filter((m) => !existingMovSet.has(m.idMovimiento));
        if (toInsert.length > 0) {
          const BATCH = 100;
          for (let i = 0; i < toInsert.length; i += BATCH) {
            await NegocioMovimiento.bulkCreate(
              toInsert.slice(i, i + BATCH).map((m) => ({ negocio_id: neg.id, referencia: m.referencia, id_movimiento: m.idMovimiento, fecha_contable: m.fechaContable ?? null, datos: m.datos }))
            );
          }
          movCount += toInsert.length;
        }
      });
      console.log(`[backfill] Mov_Por_Propietario: ${compCount} compradores, ${movCount} movimientos`); // eslint-disable-line no-console
    }

    const total = await Negocio.count();
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    result = { ok: true, negocios: total, elapsed: `${elapsed}s` };
    console.log(`[backfill] Listo: ${total} negocios en ${elapsed}s`); // eslint-disable-line no-console
    // Los negocios se reconstruyeron: se vuelve a decidir a qué inmueble corresponde cada uno.
    await recalcularVinculos().catch((e) => console.error('[vinculos] Error al recalcular:', e.message)); // eslint-disable-line no-console
    invalidarCacheDashboard();
  } catch (err) {
    result = { ok: false, error: err.message };
    console.error('[backfill] Error:', err.message); // eslint-disable-line no-console
  } finally {
    progreso.terminar();
    for (const m of marcasManuales) {
      try {
        await Negocio.update({ en_tramite: m.en_tramite, es_canje: m.es_canje }, { where: { referencia: m.referencia } });
      } catch (err) {
        console.error('[backfill] No se pudo restaurar la marca de', m.referencia, err.message); // eslint-disable-line no-console
      }
    }
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
