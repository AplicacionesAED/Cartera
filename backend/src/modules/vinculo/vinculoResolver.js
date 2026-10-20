// Vínculo Negocio (fiducia) <-> Inmueble (Zoho), Baía Kristal.
//
// REGLA: el negocio se vincula al inmueble por NOMENCLATURA + FRENTE/TORRE, usando lo que trae el Excel de la fiducia:
//   - "Categoría" (junto al fideicomiso) se traduce a frente y torre del CRM (ver categoriaTorre.js);
//   - la "Nomenclatura" del negocio ("1A", "1-A", "524"...) se busca, dentro de esas torres, como nombre de la unidad
//     o, si no, como código del inmueble (Kala, Kaliza, Isla y Vela la traen como código, ej. 53101).
//   - si la nomenclatura coincide con más de un inmueble (la misma unidad en dos frentes de una categoría compartida)
//     se desempata por área; si aun así quedan varios, el negocio queda AMBIGUO y no se vincula.
//   - sin coincidencia queda SIN_VINCULO. Depósitos y parqueaderos no tienen inmueble en el inventario.
// 2.º PASO: si la nomenclatura no resuelve (ambiguo o sin coincidencia), se vincula por la REFERENCIA DE RECAUDO (el inmueble
// de Zoho que tiene la referencia del negocio), siempre que sea un solo inmueble. Si las dos coinciden en un inmueble distinto,
// manda la nomenclatura. Lo que ninguna resuelve queda sin vincular, con una sugerencia (la oportunidad) como pista. El resultado se guarda en `vinculos_negocio_inmueble` (una fila por negocio) y lo leen todos los
// módulos -- ver `recalcularVinculos`.
const { QueryTypes } = require('sequelize');
const sequelize = require('../../config/db');
const { PROYECTO_TORRE_EXCLUIDOS } = require('../inventario/inventarioTorres.service');
const { ESTADOS_DESISTIDOS } = require('../../config/estadosOportunidad');
const { invalidarCacheDashboard } = require('../dashboard/dashboardCache');
const VinculoNegocioInmueble = require('./vinculoNegocioInmueble.model');
const { torresDeCategoria, TIPOS_CON_INMUEBLE } = require('./categoriaTorre');

// Cuando un inmueble tiene varios negocios (uno vigente y otros antiguos en retiro/libre), el que cuenta es el
// vigente. Mismo orden que se usa en el SQL de los módulos (ver PRIORIDAD_ESTADO_SQL).
const PRIORIDAD_ESTADO = { VENDIDO: 0, ESCRITURA_AUTORIZADA: 0, PROMETIDO: 1, OPCIONADO: 1, EN_RETIRO: 2, CEDIDO: 3 };
const PRIORIDAD_ESTADO_SQL = `CASE n.estado WHEN 'VENDIDO' THEN 0 WHEN 'ESCRITURA_AUTORIZADA' THEN 0 WHEN 'PROMETIDO' THEN 1 WHEN 'OPCIONADO' THEN 1 WHEN 'EN_RETIRO' THEN 2 WHEN 'CEDIDO' THEN 3 ELSE 4 END`;

const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const numero = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
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
      `SELECT id, referencia, estado, datos->>'Nomenclatura' AS nom, upper(datos->>'Fideicomiso') AS fid, datos->>'Area' AS area,
              datos->>'Categoria' AS categoria, upper(datos->>'Tipo Inmueble') AS tipo
       FROM negocios WHERE referencia IS NOT NULL`,
      { type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT referencia_recaudo AS ref, seccion_inmueble->'Inmueble'->>'id' AS inv_zoho_id,
              seccion_inmueble->>'Torre' AS torre, seccion_inmueble->>'Nomenclatura_Inmueble' AS nom
       FROM oportunidades WHERE referencia_recaudo IS NOT NULL
         AND NOT (stage = ANY($1::text[]))`,
      { bind: [[...ESTADOS_DESISTIDOS]], type: QueryTypes.SELECT }
    ),
  ]);
  return { inmuebles, negocios, oportunidades };
}

// Decide el inmueble de UN negocio por nomenclatura + frente/torre (ver el encabezado). La referencia de recaudo y la
// oportunidad solo alimentan la "sugerencia" de los casos que no se pudieron vincular.
function resolverNegocio(n, ctx) {
  const { porId, porRef, porZoho, oppsPorRef, inmuebles } = ctx;
  const esLibre = n.estado === 'LIBRE';
  const base = { referencia: n.referencia, negocio_estado: n.estado, metodo: null };
  const sinInmueble = (estado, detalle, requiere, extra = {}) => ({
    ...base, inventario_id: null, estado, requiere_revision: requiere, detalle, observaciones: extra.observaciones ?? null, senales: extra.senales ?? null,
  });

  // Depósitos y parqueaderos no están en el inventario de inmuebles del CRM.
  if (!TIPOS_CON_INMUEBLE.has(n.tipo)) {
    return sinInmueble('SIN_VINCULO', `${n.tipo ? n.tipo.charAt(0) + n.tipo.slice(1).toLowerCase() : 'Esta unidad'} (${n.nom ?? '—'}): no tiene inmueble en el inventario, no se vincula por nomenclatura.`, false);
  }

  const torres = torresDeCategoria(n.fid, n.categoria);
  const nom = norm(n.nom);
  let candidatos = [];
  if (torres && nom) {
    const enTorres = inmuebles.filter((i) => torres.includes(norm(i.pt)));
    candidatos = enTorres.filter((i) => norm(i.nombre) === nom);
    if (!candidatos.length) candidatos = enTorres.filter((i) => i.cod && norm(i.cod) === nom);
    // La misma unidad en dos frentes de una categoría compartida: se desempata por área.
    if (candidatos.length > 1) {
      const area = numero(n.area);
      if (area && area > 2) {
        const porArea = candidatos.filter((i) => [numero(i.ap), numero(i.ac)].some((x) => x != null && Math.abs(x - area) < 0.06));
        if (porArea.length === 1) candidatos = porArea;
      }
    }
  }

  if (candidatos.length === 1) {
    return { ...base, inventario_id: candidatos[0].id, estado: 'CONFIRMADO', metodo: 'nomenclatura', requiere_revision: false, detalle: null, observaciones: null, senales: { candidatos: [candidatos[0].id] } };
  }

  // 2.º paso: la referencia de recaudo (el inmueble de Zoho que tiene la referencia del negocio), solo si es UN inmueble.
  // Rescata los negocios que la nomenclatura deja ambiguos o sin coincidencia; entra a "por revisar" porque la
  // nomenclatura no lo confirmó.
  const A = (porRef.get(n.referencia) ?? []).map((i) => i.id);
  if (A.length === 1) {
    const motivo = candidatos.length > 1
      ? `La nomenclatura "${n.nom}" coincide con ${candidatos.length} inmuebles y el área no los desempata`
      : torres
        ? `No hay un inmueble con la nomenclatura "${n.nom}" en la torre que indica la categoría "${n.categoria}"`
        : `La categoría "${n.categoria ?? '—'}" no tiene traducción a frente y torre`;
    return { ...base, inventario_id: A[0], estado: 'REFERENCIA', metodo: 'referencia', requiere_revision: !esLibre, detalle: `${motivo}; se vinculó por la referencia de recaudo.`, observaciones: null, senales: { referencia: A, candidatos: candidatos.map((i) => i.id) } };
  }

  // Sin vincular: se arma una sugerencia (solo pista) con la oportunidad.
  const opps = oppsPorRef.get(n.referencia) ?? [];
  const B = [...new Set(opps.map((o) => o.inv_zoho_id && porZoho.get(o.inv_zoho_id)?.id).filter((x) => x != null))];
  let sugerido = null;
  let origen = null;
  if (B.length === 1) { sugerido = B[0]; origen = 'la oportunidad'; }
  const u = sugerido != null ? porId.get(sugerido) : null;
  const observaciones = [];
  if (u) observaciones.push(`Sugerencia (según ${origen}): ${etiqueta(u)}${u.ref ? `, que hoy tiene la referencia ${u.ref} en Zoho` : ''}.`);

  let estado;
  let detalle;
  if (candidatos.length > 1) {
    estado = 'AMBIGUO';
    detalle = `La nomenclatura "${n.nom}" (categoría ${n.categoria ?? '—'}) coincide con ${candidatos.length} inmuebles y no se pudo desempatar por área: ${candidatos.map((i) => etiqueta(i)).join(', ')}.`;
  } else {
    estado = 'SIN_VINCULO';
    detalle = !torres
      ? `La categoría "${n.categoria ?? '—'}" del fideicomiso ${String(n.fid ?? '').slice(0, 5)} no tiene traducción a frente y torre.`
      : !nom
        ? 'El negocio no trae nomenclatura.'
        : `No hay un inmueble con la nomenclatura "${n.nom}" en la torre que indica la categoría "${n.categoria}".`;
  }
  return sinInmueble(estado, detalle, !esLibre, { observaciones: observaciones.length ? observaciones : null, senales: { sugerido, candidatos: candidatos.map((i) => i.id) } });
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
    oppsPorRef.get(o.ref).push(o);
  }
  // Inmuebles que ya pertenecen (por referencia) a algún negocio: el respaldo por código no puede tomarlos.
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
