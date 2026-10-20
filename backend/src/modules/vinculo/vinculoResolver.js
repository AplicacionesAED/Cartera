// Resolvedor del vínculo Negocio (fiducia) <-> Inmueble (Zoho), Baía Kristal.
//
// Por qué existe: la referencia de recaudo del inmueble en Zoho muchas veces está desactualizada (quedó la de un
// negocio anterior, o la de otra oportunidad), y entonces el negocio queda sin inmueble o se cruza con otro.
// En vez de confiar en UNA fuente, cada negocio se decide con TRES señales independientes:
//
//   A. Referencia:     el inmueble de Zoho que tiene la referencia del negocio (`inventario_items.referencia_recaudo`).
//   B. Oportunidad:    el inmueble que la oportunidad del negocio (misma referencia) tiene en su propio campo Inmueble.
//   C. Nomenclatura:   la nomenclatura que trae el Excel de la fiducia, en tres niveles de precisión:
//                        1) código completo = `C_digo_inmueble` (único; Kaliza, Isla, Kala, Vela...)
//                        2) nombre de la unidad + proyecto del fideicomiso (Plaza, Vela C2...)
//                        3) si hay varios, se desempata por el área (Kabo, Privé: la fiducia trae "6C" sin torre)
//
// Gana el inmueble que apoyan al menos DOS señales. Cada señal solo "vota" si apunta a UN inmueble. Así, una
// señal equivocada (p. ej. un código mal puesto en Zoho: `210A` con código `210`) pierde contra las otras dos.
// El resultado se guarda en `vinculos_negocio_inmueble` (una fila por negocio, con el porqué) y lo leen
// todos los módulos -- ver `recalcularVinculos`.
const { QueryTypes } = require('sequelize');
const sequelize = require('../../config/db');
const { PROYECTO_TORRE_EXCLUIDOS } = require('../inventario/inventarioTorres.service');
const { invalidarCacheDashboard } = require('../dashboard/dashboardCache');
const VinculoNegocioInmueble = require('./vinculoNegocioInmueble.model');

// Cuando un inmueble tiene varios negocios (uno vigente y otros antiguos en retiro/libre), el que cuenta es el
// vigente. Mismo orden que se usa en el SQL de los módulos (ver PRIORIDAD_ESTADO_SQL).
const PRIORIDAD_ESTADO = { VENDIDO: 0, ESCRITURA_AUTORIZADA: 0, PROMETIDO: 1, OPCIONADO: 1, EN_RETIRO: 2, CEDIDO: 3 };
const PRIORIDAD_ESTADO_SQL = `CASE n.estado WHEN 'VENDIDO' THEN 0 WHEN 'ESCRITURA_AUTORIZADA' THEN 0 WHEN 'PROMETIDO' THEN 1 WHEN 'OPCIONADO' THEN 1 WHEN 'EN_RETIRO' THEN 2 WHEN 'CEDIDO' THEN 3 ELSE 4 END`;

const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const numero = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const primeraPalabra = (p) => norm(String(p || '').split(/\s+/)[0]);
const etiqueta = (i) => `${i.nombre} (${i.pt ?? i.proyecto ?? 's/proyecto'})`;

async function cargarDatos() {
  const [inmuebles, negocios, oportunidades] = await Promise.all([
    // Mismo universo que ve el módulo de Negocios (`combinado` de negocio.service.js): sin proyectos excluidos ni
    // nombres marcados con '*'. Si un negocio se vinculara a uno excluido, desaparecería del listado.
    sequelize.query(
      `SELECT id, zoho_id, nombre, proyecto, referencia_recaudo AS ref, estado,
              datos->>'C_digo_inmueble' AS cod, datos->>'Proyecto_Torre' AS pt,
              datos->>'Area_Privada_m2_RP' AS ap, datos->>'Area_Construida_m2_v2_RP' AS ac
       FROM inventario_items
       WHERE COALESCE(datos->>'Proyecto_Torre', '') <> ALL($1::text[]) AND COALESCE(datos->>'Product_Name', '') NOT LIKE '*%'`,
      { bind: [[...PROYECTO_TORRE_EXCLUIDOS]], type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT id, referencia, estado, datos->>'Nomenclatura' AS nom, upper(datos->>'Fideicomiso') AS fid, datos->>'Area' AS area
       FROM negocios WHERE referencia IS NOT NULL`,
      { type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT referencia_recaudo AS ref, seccion_inmueble->'Inmueble'->>'id' AS inv_zoho_id
       FROM oportunidades WHERE referencia_recaudo IS NOT NULL AND seccion_inmueble->'Inmueble'->>'id' IS NOT NULL`,
      { type: QueryTypes.SELECT }
    ),
  ]);
  return { inmuebles, negocios, oportunidades };
}

// Señal C: nomenclatura de la fiducia -> inmuebles candidatos.
function porNomenclatura(n, inmuebles) {
  const nom = norm(n.nom);
  if (!nom) return { nivel: 0, ids: [] };
  const completo = inmuebles.filter((i) => i.cod && norm(i.cod) === nom);
  if (completo.length) return { nivel: 1, ids: completo.map((i) => i.id) };
  const fid = norm(n.fid);
  const porNombre = inmuebles.filter((i) => norm(i.nombre) === nom && primeraPalabra(i.proyecto) && fid.includes(primeraPalabra(i.proyecto)));
  if (porNombre.length === 1) return { nivel: 2, ids: [porNombre[0].id] };
  if (porNombre.length > 1) {
    const area = numero(n.area);
    if (area && area > 2) {
      const porArea = porNombre.filter((i) => [numero(i.ap), numero(i.ac)].some((x) => x != null && Math.abs(x - area) < 0.06));
      if (porArea.length) return { nivel: 3, ids: porArea.map((i) => i.id) };
    }
    return { nivel: 2, ids: porNombre.map((i) => i.id) };
  }
  return { nivel: 0, ids: [] };
}

// Decide el inmueble de UN negocio con las tres señales. `ctx` trae los índices precalculados.
function resolverNegocio(n, ctx) {
  const { porId, porRef, porZoho, oppsPorRef, inmuebles } = ctx;
  const A = (porRef.get(n.referencia) ?? []).map((i) => i.id);
  const B = [...new Set((oppsPorRef.get(n.referencia) ?? []).map((z) => porZoho.get(z)?.id).filter((x) => x != null))];
  const c = porNomenclatura(n, inmuebles);
  const senales = [
    { nombre: 'referencia', ids: A },
    { nombre: 'oportunidad', ids: B },
    { nombre: 'nomenclatura', ids: c.ids, nivel: c.nivel },
  ];

  // Cada señal con exactamente UN inmueble vota por él.
  const votos = new Map();
  const votar = (id, quien) => votos.set(id, [...(votos.get(id) ?? []), quien]);
  for (const s of senales) if (s.ids.length === 1) votar(s.ids[0], s.nombre);
  // Una señal con varios candidatos refuerza al que ya tiene el voto de otra señal.
  for (const s of senales) {
    if (s.ids.length > 1) for (const id of s.ids) if (votos.has(id) && !votos.get(id).includes(s.nombre)) votar(id, s.nombre);
  }
  const ranking = [...votos.entries()].sort((x, y) => y[1].length - x[1].length);

  let ganador = null;
  let estado;
  let metodo = null;
  const unaSola = senales.filter((s) => s.ids.length > 0);

  if (ranking.length && ranking[0][1].length >= 2 && !(ranking[1] && ranking[1][1].length === ranking[0][1].length)) {
    ganador = ranking[0][0];
    metodo = ranking[0][1].join('+');
    estado = A.includes(ganador) ? 'CONFIRMADO' : 'CORREGIDO';
  } else if (ranking.length === 1 && unaSola.length === 1 && unaSola[0].ids.length === 1) {
    ganador = ranking[0][0];
    metodo = ranking[0][1][0];
    estado = 'UNA_SENAL';
  } else if (ranking.length >= 1) {
    // Señales que se contradicen sin mayoría: se conserva la de mayor jerarquía (referencia > oportunidad > nomenclatura).
    const orden = ['referencia', 'oportunidad', 'nomenclatura'];
    const elegida = ranking.map(([id, q]) => ({ id, q })).sort((x, y) => Math.min(...x.q.map((s) => orden.indexOf(s))) - Math.min(...y.q.map((s) => orden.indexOf(s))))[0];
    ganador = elegida.id;
    metodo = elegida.q.join('+');
    estado = 'CONFLICTO';
  } else if (unaSola.length) {
    estado = 'AMBIGUO';
  } else {
    estado = 'SIN_VINCULO';
  }

  const u = ganador != null ? porId.get(ganador) : null;
  const observaciones = [];
  let detalle = null;

  if (ganador != null) {
    // Señales que apuntan a otro inmueble (aunque hayan perdido el voto).
    for (const s of senales) {
      if (s.ids.length === 1 && s.ids[0] !== ganador) {
        const otro = porId.get(s.ids[0]);
        const texto = s.nombre === 'referencia' ? 'la referencia' : s.nombre === 'oportunidad' ? 'la oportunidad' : 'la nomenclatura de la fiducia';
        if (otro) observaciones.push(`${texto[0].toUpperCase()}${texto.slice(1)} apunta a ${etiqueta(otro)}, que no es el inmueble elegido.`);
      }
    }
    if (A.length === 0 && estado !== 'UNA_SENAL') observaciones.push(`Ningún inmueble de Zoho tiene la referencia ${n.referencia}.`);
    if (A.length > 1) observaciones.push(`${A.length} inmuebles de Zoho comparten la referencia ${n.referencia}: ${A.map((id) => etiqueta(porId.get(id))).join(', ')}.`);
  }

  if (estado === 'CORREGIDO') {
    detalle = u.ref
      ? `El inmueble ${etiqueta(u)} tiene en Zoho la referencia ${u.ref} y no la del negocio (${n.referencia}). Se vinculó por ${metodo.replace('+', ' y ')}.`
      : `El inmueble ${etiqueta(u)} no tiene referencia de recaudo en Zoho (debería ser ${n.referencia}). Se vinculó por ${metodo.replace('+', ' y ')}.`;
  } else if (estado === 'CONFLICTO') {
    detalle = `Las señales no coinciden: ${senales.filter((s) => s.ids.length).map((s) => `${s.nombre} → ${s.ids.map((id) => etiqueta(porId.get(id))).join(' / ')}`).join('; ')}.`;
  } else if (estado === 'AMBIGUO') {
    const cand = senales.find((s) => s.ids.length > 1);
    detalle = `Hay ${cand?.ids.length ?? 'varios'} inmuebles posibles para la nomenclatura "${n.nom}": ${(cand?.ids ?? []).slice(0, 6).map((id) => etiqueta(porId.get(id))).join(', ')}${(cand?.ids.length ?? 0) > 6 ? '…' : ''}.`;
  } else if (estado === 'SIN_VINCULO') {
    detalle = `No se encontró ningún inmueble para la referencia ${n.referencia} ni para la nomenclatura "${n.nom ?? '—'}".`;
  } else if (estado === 'UNA_SENAL') {
    detalle = `Solo coincide ${metodo}; las otras señales no tienen información.`;
  }

  const esLibre = n.estado === 'LIBRE';
  const requiereRevision = !esLibre && (['CORREGIDO', 'CONFLICTO', 'AMBIGUO', 'SIN_VINCULO'].includes(estado) || (estado === 'CONFIRMADO' && observaciones.length > 0));

  return {
    referencia: n.referencia,
    inventario_id: ganador,
    estado,
    metodo,
    negocio_estado: n.estado,
    requiere_revision: requiereRevision,
    detalle,
    observaciones: observaciones.length ? observaciones : null,
    senales: { referencia: A, oportunidad: B, nomenclatura: { nivel: c.nivel, ids: c.ids } },
  };
}

function construirContexto({ inmuebles, oportunidades }) {
  const porId = new Map(inmuebles.map((i) => [i.id, i]));
  const porZoho = new Map(inmuebles.map((i) => [i.zoho_id, i]));
  const porRef = new Map();
  for (const i of inmuebles) {
    if (!i.ref) continue;
    if (!porRef.has(i.ref)) porRef.set(i.ref, []);
    porRef.get(i.ref).push(i);
  }
  const oppsPorRef = new Map();
  for (const o of oportunidades) {
    if (!oppsPorRef.has(o.ref)) oppsPorRef.set(o.ref, []);
    oppsPorRef.get(o.ref).push(o.inv_zoho_id);
  }
  return { porId, porZoho, porRef, oppsPorRef, inmuebles };
}

// Calcula (sin guardar) el vínculo de todos los negocios.
async function calcularVinculos() {
  const datos = await cargarDatos();
  const ctx = construirContexto(datos);
  return { filas: datos.negocios.map((n) => resolverNegocio(n, ctx)), ctx, negocios: datos.negocios };
}

let enCurso = null;

// Recalcula y guarda TODO (borra y vuelve a crear en una transacción: nunca queda la tabla a medias).
// Llamado al terminar la reconstrucción de Negocios y las sincronizaciones de Zoho. Si ya hay un cálculo en
// curso, comparte su resultado en vez de lanzar otro.
function recalcularVinculos() {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const t0 = Date.now();
    const { filas } = await calcularVinculos();
    await sequelize.transaction(async (t) => {
      await VinculoNegocioInmueble.destroy({ where: {}, truncate: false, transaction: t });
      for (let i = 0; i < filas.length; i += 500) {
        await VinculoNegocioInmueble.bulkCreate(filas.slice(i, i + 500), { transaction: t });
      }
    });
    invalidarCacheDashboard();
    const porEstado = filas.reduce((a, f) => ({ ...a, [f.estado]: (a[f.estado] ?? 0) + 1 }), {});
    console.log(`[vinculos] ${filas.length} negocios vinculados en ${Date.now() - t0} ms`, porEstado); // eslint-disable-line no-console
    return { total: filas.length, porEstado };
  })().finally(() => { enCurso = null; });
  return enCurso;
}

// Si la tabla está vacía (primer arranque tras la migración), la llena.
async function asegurarVinculos() {
  const total = await VinculoNegocioInmueble.count();
  const negocios = await sequelize.query('SELECT COUNT(*)::int AS n FROM negocios', { type: QueryTypes.SELECT });
  if (total === 0 && negocios[0].n > 0) return recalcularVinculos();
  return null;
}

module.exports = { calcularVinculos, recalcularVinculos, asegurarVinculos, PRIORIDAD_ESTADO, PRIORIDAD_ESTADO_SQL };
