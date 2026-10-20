// Vínculo Negocio (fiducia) <-> Inmueble (Zoho), Baía Kristal.
//
// REGLA: la fuente de verdad es el CRM. Un negocio se vincula al inmueble de Zoho que tiene SU MISMA referencia de
// recaudo (`negocio.referencia = inventario_items.referencia_recaudo`), nada más. La app no corrige ni decide:
//   - una sola coincidencia  -> CONFIRMADO (vinculado)
//   - varios inmuebles con esa referencia -> AMBIGUO (no se vincula: el CRM debe dejar uno)
//   - ninguna coincidencia   -> SIN_VINCULO (no se vincula)
// Respaldo (el mismo de la app original): si ninguna referencia coincide, el negocio se vincula al inmueble cuyo
// código (`C_digo_inmueble`) es EXACTAMENTE la nomenclatura del negocio, siempre que sea un solo inmueble y que ese
// inmueble no pertenezca ya (por referencia) a otro negocio -- así no se roban negocios entre unidades (caso Vela
// 210A / The Plaza 210). Estado RESPALDO: cuenta como vinculado pero entra a "Vínculos por revisar" (el inmueble
// debería tener la referencia del negocio en Zoho).
// En los dos últimos casos el negocio entra a "Vínculos por revisar" con una SUGERENCIA para el CRM, calculada con
// la oportunidad (su campo Inmueble) y la nomenclatura de la fiducia. La sugerencia es solo una pista: no vincula
// nada ni afecta ningún total hasta que el CRM corrija la referencia en Zoho. El resultado se guarda en
// `vinculos_negocio_inmueble` (una fila por negocio) y lo leen todos los módulos -- ver `recalcularVinculos`.
const { QueryTypes } = require('sequelize');
const sequelize = require('../../config/db');
const { PROYECTO_TORRE_EXCLUIDOS } = require('../inventario/inventarioTorres.service');
const { ESTADOS_DESISTIDOS } = require('../../config/estadosOportunidad');
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
       FROM oportunidades WHERE referencia_recaudo IS NOT NULL AND seccion_inmueble->'Inmueble'->>'id' IS NOT NULL
         AND NOT (stage = ANY($1::text[]))`,
      { bind: [[...ESTADOS_DESISTIDOS]], type: QueryTypes.SELECT }
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

// Decide el inmueble de UN negocio: solo por referencia. Sin coincidencia exacta calcula una sugerencia para el CRM.
function resolverNegocio(n, ctx) {
  const { porId, porRef, porZoho, oppsPorRef, inmuebles } = ctx;
  const A = (porRef.get(n.referencia) ?? []).map((i) => i.id);
  const esLibre = n.estado === 'LIBRE';

  if (A.length === 1) {
    return {
      referencia: n.referencia, inventario_id: A[0], estado: 'CONFIRMADO', metodo: 'referencia', negocio_estado: n.estado,
      requiere_revision: false, detalle: null, observaciones: null, senales: { referencia: A },
    };
  }

  // Respaldo por código exacto de inmueble.
  const porCodigo = n.nom ? inmuebles.filter((i) => i.cod != null && String(i.cod) === String(n.nom)) : [];
  if (A.length === 0 && porCodigo.length === 1 && !ctx.reclamados.has(porCodigo[0].id)) {
    const u = porCodigo[0];
    return {
      referencia: n.referencia, inventario_id: u.id, estado: 'RESPALDO', metodo: 'codigo', negocio_estado: n.estado,
      requiere_revision: !esLibre,
      detalle: u.ref
        ? `Vinculado por el código del inmueble (${u.cod}). El inmueble ${etiqueta(u)} tiene en Zoho la referencia ${u.ref} y no la del negocio (${n.referencia}).`
        : `Vinculado por el código del inmueble (${u.cod}). El inmueble ${etiqueta(u)} no tiene referencia de recaudo en Zoho (debería ser ${n.referencia}).`,
      observaciones: null, senales: { referencia: A, codigo: [u.id] },
    };
  }

  // Sugerencia (solo pista): inmueble de la oportunidad y/o nomenclatura de la fiducia.
  const B = [...new Set((oppsPorRef.get(n.referencia) ?? []).map((z) => porZoho.get(z)?.id).filter((x) => x != null))];
  const c = porNomenclatura(n, inmuebles);
  let sugerido = null;
  let origen = null;
  if (B.length === 1) { sugerido = B[0]; origen = 'la oportunidad'; }
  else if (c.ids.length === 1) { sugerido = c.ids[0]; origen = 'la nomenclatura de la fiducia'; }
  const u = sugerido != null ? porId.get(sugerido) : null;
  const confirmaOtra = B.length === 1 && c.ids.length === 1 && B[0] === c.ids[0] ? ' (la oportunidad y la nomenclatura coinciden)' : '';

  let estado;
  let detalle;
  const observaciones = [];
  if (A.length > 1) {
    estado = 'AMBIGUO';
    detalle = `${A.length} inmuebles de Zoho tienen la referencia ${n.referencia}: ${A.map((id) => etiqueta(porId.get(id))).join(', ')}. Debe quedar en uno solo.`;
  } else {
    estado = 'SIN_VINCULO';
    detalle = `Ningún inmueble de Zoho tiene la referencia ${n.referencia}.`;
  }
  if (u) {
    observaciones.push(
      u.ref
        ? `Sugerencia (según ${origen}${confirmaOtra}): ${etiqueta(u)}, que hoy tiene la referencia ${u.ref} en Zoho.`
        : `Sugerencia (según ${origen}${confirmaOtra}): ${etiqueta(u)}, que no tiene referencia de recaudo en Zoho.`
    );
  } else if (c.ids.length > 1) {
    observaciones.push(`La nomenclatura "${n.nom}" coincide con varios inmuebles: ${c.ids.slice(0, 5).map((id) => etiqueta(porId.get(id))).join(', ')}${c.ids.length > 5 ? '…' : ''}.`);
  }

  return {
    referencia: n.referencia,
    inventario_id: null,
    estado,
    metodo: null,
    negocio_estado: n.estado,
    requiere_revision: !esLibre,
    detalle,
    observaciones: observaciones.length ? observaciones : null,
    senales: { referencia: A, sugerido },
  };
}

function construirContexto({ inmuebles, oportunidades, negocios }) {
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
  // Inmuebles que ya pertenecen (por referencia) a algún negocio: el respaldo por código no puede tomarlos.
  const refsNegocio = new Set(negocios.map((n) => n.referencia));
  const reclamados = new Set(inmuebles.filter((i) => i.ref && refsNegocio.has(i.ref)).map((i) => i.id));
  return { porId, porZoho, porRef, oppsPorRef, inmuebles, reclamados };
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
