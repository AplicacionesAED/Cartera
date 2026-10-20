// "Vínculos por revisar": los negocios cuyo inmueble no se pudo confirmar con seguridad (ver vinculoResolver.js) y
// los inmuebles de Zoho que comparten la misma referencia de recaudo. Es lo que el equipo del CRM debe corregir en
// Zoho; mientras tanto la app ya usa el vínculo resuelto.
const { QueryTypes } = require('sequelize');
const sequelize = require('../../config/db');

const ACCION_SUGERIDA = {
  AMBIGUO: 'Dejar la referencia de recaudo en un solo inmueble de Zoho (quitarla de los demás).',
  SIN_VINCULO: 'Poner esta referencia de recaudo en el inmueble correcto de Zoho (ver la sugerencia).',
};

async function listar({ estado, search, soloRevision = 'true' } = {}) {
  const bind = [];
  const cond = [];
  if (soloRevision !== 'false') cond.push('v.requiere_revision');
  if (estado) { bind.push(estado); cond.push(`v.estado = $${bind.length}`); }
  if (search) {
    bind.push(`%${search}%`);
    cond.push(`(v.referencia ILIKE $${bind.length} OR n.datos->>'Nomenclatura' ILIKE $${bind.length} OR inv.nombre ILIKE $${bind.length} OR v.detalle ILIKE $${bind.length})`);
  }
  const filas = await sequelize.query(
    `SELECT v.referencia, v.estado, v.metodo, v.negocio_estado AS "negocioEstado", v.requiere_revision AS "requiereRevision", v.detalle, v.observaciones,
            n.id AS "negocioId", n.datos->>'Nomenclatura' AS nomenclatura, n.datos->>'Fideicomiso' AS fideicomiso,
            inv.id AS "inventarioId", inv.nombre AS "inmueble", inv.datos->>'Proyecto_Torre' AS "proyectoTorre", inv.referencia_recaudo AS "referenciaInmueble",
            sug.id AS "sugeridoId", sug.nombre AS "sugerido", sug.datos->>'Proyecto_Torre' AS "sugeridoProyectoTorre", sug.referencia_recaudo AS "sugeridoReferencia"
     FROM vinculos_negocio_inmueble v
     JOIN negocios n ON n.referencia = v.referencia
     LEFT JOIN inventario_items inv ON inv.id = v.inventario_id
     LEFT JOIN inventario_items sug ON sug.id = NULLIF(v.senales->>'sugerido', '')::int
     ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
     ORDER BY CASE v.negocio_estado WHEN 'VENDIDO' THEN 0 WHEN 'ESCRITURA_AUTORIZADA' THEN 0 WHEN 'PROMETIDO' THEN 1 WHEN 'OPCIONADO' THEN 1 WHEN 'EN_RETIRO' THEN 2 ELSE 3 END, v.estado, v.referencia`,
    { bind, type: QueryTypes.SELECT }
  );
  return filas.map((f) => ({ ...f, accionSugerida: ACCION_SUGERIDA[f.estado] ?? null }));
}

// Referencias de recaudo que tienen más de un inmueble en Zoho (el dato que causa los cruces equivocados).
async function referenciasDuplicadas() {
  const filas = await sequelize.query(
    `SELECT referencia_recaudo AS referencia, COUNT(*)::int AS cantidad,
            jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'proyectoTorre', datos->>'Proyecto_Torre', 'estado', estado) ORDER BY id) AS inmuebles
     FROM inventario_items
     WHERE referencia_recaudo IS NOT NULL AND referencia_recaudo <> '' AND COALESCE(datos->>'Product_Name', '') NOT LIKE '*%'
     GROUP BY referencia_recaudo HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC, referencia_recaudo`,
    { type: QueryTypes.SELECT }
  );
  return filas;
}

async function resumen() {
  const [porEstado, [{ n: pendientes }]] = await Promise.all([
    sequelize.query('SELECT estado, COUNT(*)::int AS cantidad FROM vinculos_negocio_inmueble GROUP BY estado', { type: QueryTypes.SELECT }),
    sequelize.query('SELECT COUNT(*)::int AS n FROM vinculos_negocio_inmueble WHERE requiere_revision', { type: QueryTypes.SELECT }),
  ]);
  return { porEstado, pendientes };
}

async function contarPendientes() {
  const [{ n }] = await sequelize.query('SELECT COUNT(*)::int AS n FROM vinculos_negocio_inmueble WHERE requiere_revision', { type: QueryTypes.SELECT });
  return n;
}

async function obtener(query) {
  const [vinculos, duplicadas, res] = await Promise.all([listar(query), referenciasDuplicadas(), resumen()]);
  return { vinculos, duplicadas, resumen: res };
}

module.exports = { obtener, contarPendientes };
