// Subconjunto de zoho-payment-tracker/backend/src/baia-kristal/services/inventarioNegocioService.js
// que solo toca InventarioItem -- las funciones que cruzan con Negocio/
// Opportunity (listarNegociosInventario, obtenerNegocioPorId, etc.) se
// portan en la fase de Negocios, cuando esas tablas existan en esta base.
//
// `pisosPorFrenteTorre`/`valoresProyectoTorre` también los usa
// `configuracionFrente.service.js` para enriquecer su lista con el árbol
// completo de frentes/torres/pisos (antes solo devolvía lo ya configurado).
const sequelize = require('../../config/db');
const { QueryTypes } = require('sequelize');
const { PROYECTO_TORRE_EXCLUIDOS } = require('../../config/inventarioExcluido');
const { esEtapaDesistida } = require('../../config/estadosOportunidad');

// Etapa constructiva de cada Torre (proyecto + número de torre → etapa
// 1-4), solo para Kabo/Prive/Kala/Kaliza. Isla Laguna, The Plaza y Vela
// Village NO reparten por etapas numeradas: cada uno ES su propia etapa.
const ETAPA_POR_TORRE = {
  'KABO 1': '1', 'KABO 2': '1', 'PRIVE 2': '1', 'PRIVE 3': '1',
  'KABO 3': '2', 'KABO 4': '2', 'PRIVE 1': '2', 'PRIVE 4': '2',
  'KALA 1': '3', 'KALA 2': '3', 'KALIZA 1': '3', 'KALIZA 2': '3',
  'KALA 3': '4', 'KALA 4': '4', 'KALIZA 3': '4',
};

const SIN_PROYECTO = 'Sin proyecto';

const FRENTES_CON_ETAPA_NUMERICA = new Set(Object.keys(ETAPA_POR_TORRE).map((k) => k.split(' ')[0]));

function esFrenteSeleccionable(frente) {
  return FRENTES_CON_ETAPA_NUMERICA.has(String(frente).toUpperCase());
}

// Parsea "Kabo - Torre 3", "Kala Golf - Torre  4" -> { proyecto: "Kabo", torre: "3" }.
function parseProyectoTorre(proyectoTorreRaw) {
  const m = String(proyectoTorreRaw ?? '').match(/^(.+?)\s*-\s*Torre\s*(\d+)/i);
  if (!m) return null;
  const proyecto = m[1].trim().replace(/\s*golf$/i, '');
  return { proyecto, torre: m[2] };
}

function formatearProyectoTorre(info) {
  return `${info.proyecto} Torre ${info.torre}`;
}

function parsePisoNumero(piso) {
  if (!piso) return null;
  const m = String(piso).match(/\d+/);
  return m ? m[0] : null;
}

function obtenerEtapaTorre(proyectoTorreRaw) {
  const info = parseProyectoTorre(proyectoTorreRaw);
  if (!info) return null;
  return ETAPA_POR_TORRE[`${info.proyecto.toUpperCase()} ${info.torre}`] ?? info.proyecto;
}

function compararEtapas(a, b) {
  if (a === SIN_PROYECTO) return b === SIN_PROYECTO ? 0 : 1;
  if (b === SIN_PROYECTO) return -1;
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

// "Nomenclatura completa" de un inmueble: Proyecto + Torre + Piso + Unidad, p. ej.
// "Kabo Torre 4 Piso 3 3-M". Reemplaza al Project_Code de Zoho, que ya no se usa
// en ninguna parte (venía mal copiado en varios inmuebles: 118 sin valor y casos
// con el número de OTRA unidad), mientras que estas cuatro piezas existen
// siempre. La torre sale de Block_Tower ("Torre 4"); si ya empieza con el nombre
// del proyecto no se repite. Misma regla que la variable "Nomenclatura completa"
// del detalle de Inmuebles.
function nomenclaturaCompleta({ proyecto, torre, piso, nombre, datos } = {}) {
  const torreRaw = datos?.Block_Tower || torre || null;
  const torreParte = torreRaw && (!proyecto || !String(torreRaw).startsWith(String(proyecto))) ? String(torreRaw).trim() : null;
  const partes = [proyecto, torreParte, piso, nombre].filter((v) => v != null && String(v).trim() !== '').map((v) => String(v).trim());
  return partes.length ? partes.join(' ') : null;
}

// Misma regla en SQL (para buscar por la nomenclatura completa). `alias` es el
// alias de la fila con las columnas inv_proyecto/inv_torre/inv_piso/inv_nombre e
// inventario_datos (ver BASE_CTE de negocio.service.js).
function nomenclaturaCompletaSQL(alias) {
  const bt = `COALESCE(NULLIF(btrim(${alias}.inventario_datos->>'Block_Tower'), ''), NULLIF(btrim(${alias}.inv_torre), ''))`;
  return `concat_ws(' ',
    NULLIF(btrim(${alias}.inv_proyecto), ''),
    CASE WHEN ${bt} IS NOT NULL AND (NULLIF(btrim(${alias}.inv_proyecto), '') IS NULL OR left(${bt}, length(btrim(${alias}.inv_proyecto))) <> btrim(${alias}.inv_proyecto)) THEN ${bt} END,
    NULLIF(btrim(${alias}.inv_piso), ''),
    NULLIF(btrim(${alias}.inv_nombre), ''))`;
}

// Valores crudos de Proyecto_Torre, agrupados de varias formas para los
// selects en cascada (Etapa -> Frente -> Torre) del frontend.
async function valoresProyectoTorre() {
  const rows = await sequelize.query(
    `SELECT DISTINCT datos->>'Proyecto_Torre' AS v FROM inventario_items WHERE datos->>'Proyecto_Torre' IS NOT NULL`,
    { type: QueryTypes.SELECT }
  );

  const porEtapa = new Map();
  const porFrente = new Map();
  const porFrenteTorre = new Map();
  const frentesPorEtapaSet = new Map();
  const torresPorFrenteSet = new Map();
  const torresPorEtapaFrenteSet = new Map();

  for (const { v } of rows) {
    const et = obtenerEtapaTorre(v);
    if (!porEtapa.has(et)) porEtapa.set(et, []);
    porEtapa.get(et).push(v);

    const info = parseProyectoTorre(v);
    if (!info) continue;

    if (!porFrente.has(info.proyecto)) porFrente.set(info.proyecto, []);
    porFrente.get(info.proyecto).push(v);

    const claveFrenteTorre = `${info.proyecto}||${info.torre}`;
    if (!porFrenteTorre.has(claveFrenteTorre)) porFrenteTorre.set(claveFrenteTorre, []);
    porFrenteTorre.get(claveFrenteTorre).push(v);

    if (!frentesPorEtapaSet.has(et)) frentesPorEtapaSet.set(et, new Set());
    frentesPorEtapaSet.get(et).add(info.proyecto);

    if (!torresPorFrenteSet.has(info.proyecto)) torresPorFrenteSet.set(info.proyecto, new Set());
    torresPorFrenteSet.get(info.proyecto).add(info.torre);

    const claveEtapaFrente = `${et}||${info.proyecto}`;
    if (!torresPorEtapaFrenteSet.has(claveEtapaFrente)) torresPorEtapaFrenteSet.set(claveEtapaFrente, new Set());
    torresPorEtapaFrenteSet.get(claveEtapaFrente).add(info.torre);
  }

  const frentesPorEtapa = {};
  for (const [et, set] of frentesPorEtapaSet) frentesPorEtapa[et] = [...set].sort();

  const torresPorFrente = {};
  for (const [fr, set] of torresPorFrenteSet) torresPorFrente[fr] = [...set].sort((a, b) => Number(a) - Number(b));

  const torresPorEtapaFrente = {};
  for (const [key, set] of torresPorEtapaFrenteSet) torresPorEtapaFrente[key] = [...set].sort((a, b) => Number(a) - Number(b));

  return { porEtapa, porFrente, porFrenteTorre, frentesPorEtapa, torresPorFrente, torresPorEtapaFrente };
}

// Pieza de datos 'Inmueble' para la columna que comparten Otrosíes y
// Oportunidades (Jefe Gabriel, 2026-09-24 y 2026-09-25): se resuelve
// cruzando `referencia_recaudo` contra `inventario_items`, con el MISMO
// criterio que `dashboard.service.js` (Referencia de Recaudo de inventario,
// y el proyecto/torre sale de `datos->>'Proyecto_Torre'`).
//
// SIN el fallback por Nomenclatura que usa el Dashboard
// (`(datos->>'C_digo_inmueble') = negocios.datos->>'Nomenclatura'`): medido
// en la BD, el cruce directo por `referencia_recaudo` matchea 1308 de las
// 1378 filas de Otrosíes con referencia, mientras que ese fallback por
// Nomenclatura solo llega a 602 -- o sea que no agrega NADA que el directo
// no traiga (es subconjunto), y exigiría traer `Nomenclatura` al módulo
// llamador solo para eso. Extraído acá (antes vivía duplicado en
// `otrosi.service.js`) para que Oportunidades reuse EXACTAMENTE el mismo
// criterio -- las dos tablas deben verse iguales en esta columna.
//
// UNA sola query por página (no N+1), con `DISTINCT ON (referencia_recaudo)`
// + `ORDER BY id ASC` para elegir el mismo item que el `LEFT JOIN LATERAL`
// del Dashboard cuando una referencia tiene más de un item.
async function inmueblesPorReferencia(referencias) {
  const refs = [...new Set((referencias || []).filter(Boolean))];
  if (!refs.length) return new Map();
  // 1) El inmueble que decidió el resolvedor de vínculos (corrige referencias desactualizadas en Zoho).
  const vinculados = await sequelize.query(
    `SELECT v.referencia AS referencia_recaudo, i.datos->>'Proyecto_Torre' AS proyecto_torre, i.datos->>'Product_Name' AS product_name
     FROM vinculos_negocio_inmueble v JOIN inventario_items i ON i.id = v.inventario_id
     WHERE v.referencia IN (:referencias)`,
    { replacements: { referencias: refs }, type: QueryTypes.SELECT }
  );
  const porRef = new Map(vinculados.map((r) => [r.referencia_recaudo, r]));
  // 2) Sin vínculo: el primer inmueble que tenga esa referencia.
  const faltan = refs.filter((r) => !porRef.has(r));
  if (!faltan.length) return porRef;
  const rows = await sequelize.query(
    `SELECT DISTINCT ON (referencia_recaudo)
       referencia_recaudo,
       datos->>'Proyecto_Torre' AS proyecto_torre,
       datos->>'Product_Name' AS product_name
     FROM inventario_items
     WHERE referencia_recaudo IN (:referencias)
     ORDER BY referencia_recaudo ASC, id ASC`,
    { replacements: { referencias: faltan }, type: QueryTypes.SELECT }
  );
  for (const r of rows) porRef.set(r.referencia_recaudo, r);
  return porRef;
}

// Inmueble que se muestra en la fila de una oportunidad/otrosí. Una oportunidad caída (BACKOUT, desistida...) que
// comparte la referencia con la vigente NO se cuelga del inmueble del negocio vigente: si no tiene inmueble propio
// en Zoho queda "Sin inmueble" (si no, el mismo inmueble parecería tener dos oportunidades).
function inmuebleDeFila(row, porRef) {
  const propio = row.seccion_inmueble?.Inmueble?.id;
  if (!propio && esEtapaDesistida(row.stage)) return undefined;
  return porRef.get(row.referencia_recaudo);
}

function mapInmueble(item) {
  if (!item) return null;
  const info = parseProyectoTorre(item.proyecto_torre);
  const etapa = info ? obtenerEtapaTorre(item.proyecto_torre) : null;
  const frente = info ? info.proyecto : null;
  const torre = info ? info.torre : null;
  const nomenclatura = item.product_name || null;
  if (!etapa && !frente && !torre && !nomenclatura) return null;
  // `label` es el texto listo para pintar en la columna (mismo criterio de
  // `etiquetaEtapa()` del frontend: "1" -> "Etapa 1", y un nombre de proyecto
  // se deja tal cual). Se devuelve el `etapa` CRUDO también, así el frontend
  // puede componer la columna como prefiera con los 4 campos sueltos.
  const partes = [];
  if (etapa) partes.push(/^\d+$/.test(String(etapa)) ? `Etapa ${etapa}` : etapa);
  // `obtenerEtapaTorre` cae al NOMBRE del proyecto cuando la torre no está en
  // su mapa (p.ej. 'Isla Laguna'); en ese caso `etapa` y `frente` son el mismo
  // texto y hay que omitir el repetido para no pintar 'Isla Laguna - Isla Laguna'.
  if (frente && frente !== etapa) partes.push(frente);
  if (torre) partes.push(`Torre ${torre}`);
  if (nomenclatura) partes.push(nomenclatura);
  return { etapa, frente, torre, nomenclatura, label: partes.join(' - ') };
}

// Cruce `Proyecto_Torre` -> `referencia_recaudo`, para el filtro en cascada
// Etapa -> Frente -> Torre que comparten Otrosíes y Oportunidades (Jefe
// Gabriel, 2026-09-24 y 2026-09-25) -- ninguna de las dos tablas tiene su
// propio Proyecto/Torre, así que el filtro se resuelve indirecto: primero
// qué `referencia_recaudo` caen en la rama elegida de la cascada (acá), y
// con esa lista se arma el `where` del módulo llamador. Extraído de
// `otrosi.service.js` para que Oportunidades reuse el mismo criterio.
async function referenciasPorProyectoTorre(proyectosTorre) {
  if (!proyectosTorre || !proyectosTorre.length) return [];
  const rows = await sequelize.query(
    `SELECT DISTINCT referencia_recaudo FROM inventario_items
     WHERE datos->>'Proyecto_Torre' IN (:proyectosTorre) AND referencia_recaudo IS NOT NULL`,
    { replacements: { proyectosTorre }, type: QueryTypes.SELECT }
  );
  return rows.map((r) => r.referencia_recaudo);
}

// 'Sin proyecto' = lo que NO tiene un proyecto/torre en el inventario: filas
// sin `referencia_recaudo`, filas cuya referencia no matchea ningún item, y
// filas cuyo item existe pero sin `Proyecto_Torre`. Se resuelve como el
// complemento de las referencias que SÍ tienen proyecto.
async function referenciasSinProyecto() {
  const rows = await sequelize.query(
    `SELECT DISTINCT referencia_recaudo FROM inventario_items
     WHERE (datos->>'Proyecto_Torre' IS NULL OR datos->>'Proyecto_Torre' = '')
       AND referencia_recaudo IS NOT NULL`,
    { type: QueryTypes.SELECT }
  );
  return rows.map((r) => r.referencia_recaudo);
}

// Orden server-side por la columna 'Inmueble' (Jefe Gabriel, 2026-09-25),
// compartido por Otrosíes y Oportunidades -- ninguna de las dos tiene su
// propio Proyecto/Torre como columna real (se resuelve indirecto vía
// `referencia_recaudo`, ver `inmueblesPorReferencia`/`mapInmueble` arriba),
// así que no hay una columna SQL que pasar a `ordenSequelize()`
// (`utils/ordenamiento.js`) -- hace falta una subquery correlacionada.
//
// Ordena por el `Proyecto_Torre` + `Product_Name` CRUDOS de
// `inventario_items` (no por el `label` ya formateado que arma
// `mapInmueble()` en JS -- reconstruir ESA lógica en SQL, con el mapeo
// `ETAPA_POR_TORRE` incluido, no vale la pena) -- mismo orden PRÁCTICO
// (agrupa por edificio/torre/unidad), aunque el texto exacto no sea
// carácter por carácter el mismo que se ve en la columna.
//
// El mismo `ORDER BY i.id ASC LIMIT 1` de `inmueblesPorReferencia` (elige el
// mismo item cuando una referencia matchea más de uno), para que ordenar por
// esta columna sea consistente con lo que la columna realmente muestra.
//
// `tablaAlias` es el alias que Sequelize le da a la tabla principal en el
// SQL generado (el nombre del modelo, ej. "Otrosi"/"Oportunidad" -- NO el
// `tableName` de la migración) -- sin qualificar `referencia_recaudo` con
// ese alias, el nombre ambiguo se resolvería contra `inventario_items i`
// (que TAMBIÉN tiene esa columna) en vez de correlacionar con la fila de
// afuera, un bug de resolución de nombres clásico en subqueries
// correlacionadas.
function ordenLiteralInmueble(tablaAlias, sortDir) {
  const dir = String(sortDir || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  return sequelize.literal(
    `(SELECT i.datos->>'Proyecto_Torre' || ' ' || COALESCE(i.datos->>'Product_Name', '')
        FROM inventario_items i
        WHERE i.referencia_recaudo = "${tablaAlias}"."referencia_recaudo"
        ORDER BY i.id ASC
        LIMIT 1) ${dir} NULLS LAST`
  );
}

// Pisos por Frente + Torre, para la configuración de fecha de entrega
// granular por piso (ver configuracionFrente.service.js).
async function pisosPorFrenteTorre() {
  const rows = await sequelize.query(
    `SELECT DISTINCT datos->>'Proyecto_Torre' AS proyecto_torre, piso
     FROM inventario_items
     WHERE datos->>'Proyecto_Torre' IS NOT NULL AND piso IS NOT NULL`,
    { type: QueryTypes.SELECT }
  );

  const pisosSet = new Map();
  for (const { proyecto_torre: proyectoTorre, piso } of rows) {
    const info = parseProyectoTorre(proyectoTorre);
    if (!info) continue;
    const numeroPiso = parsePisoNumero(piso);
    if (!numeroPiso) continue;

    if (!pisosSet.has(info.proyecto)) pisosSet.set(info.proyecto, new Map());
    const porTorre = pisosSet.get(info.proyecto);
    if (!porTorre.has(info.torre)) porTorre.set(info.torre, new Set());
    porTorre.get(info.torre).add(numeroPiso);
  }

  const resultado = {};
  for (const [frente, porTorre] of pisosSet) {
    resultado[frente] = {};
    for (const [torre, set] of porTorre) {
      resultado[frente][torre] = [...set].sort((a, b) => Number(a) - Number(b));
    }
  }
  return resultado;
}

module.exports = {
  ETAPA_POR_TORRE,
  SIN_PROYECTO,
  PROYECTO_TORRE_EXCLUIDOS,
  esFrenteSeleccionable,
  parseProyectoTorre,
  formatearProyectoTorre,
  parsePisoNumero,
  obtenerEtapaTorre,
  compararEtapas,
  nomenclaturaCompleta,
  nomenclaturaCompletaSQL,
  valoresProyectoTorre,
  pisosPorFrenteTorre,
  inmueblesPorReferencia,
  inmuebleDeFila,
  mapInmueble,
  referenciasPorProyectoTorre,
  referenciasSinProyecto,
  ordenLiteralInmueble,
};
