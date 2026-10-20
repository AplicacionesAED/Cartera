// Vista de SOLO LECTURA 'Otrosíes' sobre la tabla propia `baia_kristal_otrosies`
// (universo completo de Baía Kristal). El listado expuesto al frontend SOLO
// devuelve registros con `otro_si_tiene_archivo = true` (filtro duro del Jefe
// Gabriel; NULL/false se trackean en la tabla internamente pero jamás salen
// por esta ruta). `requerido`: 'si'/'no' (match por prefijo para tolerar el
// acento del picklist de Zoho, p.ej. 'Sí'). Búsqueda SIMPLE por substring sobre
// `deal_name` y `referencia_recaudo` -- la búsqueda tolerante (palabras en
// cualquier posición + pg_trgm) se revirtió por decisión del Jefe Gabriel
// (2026-09-24: "Busco nombres y me salen otros"). Ver CLAUDE.md.
const axios = require('axios');
const { Op } = require('sequelize');
const { ordenSequelize } = require('../../utils/ordenamiento');
const {
  valoresProyectoTorre,
  compararEtapas,
  esFrenteSeleccionable,
  SIN_PROYECTO,
  inmueblesPorReferencia,
  inmuebleDeFila,
  mapInmueble,
  referenciasPorProyectoTorre,
  referenciasSinProyecto,
  ordenLiteralInmueble,
} = require('../inventario/inventarioTorres.service');
const ApiError = require('../../utils/ApiError');
const { getAccessToken, _clearCache } = require('../../utils/zohoAuth');
const zohoConfig = require('../../config/zoho');
const Otrosi = require('./otrosi.model');
const Usuario = require('../usuario/usuario.model');

// Whitelist de orden server-side (Jefe Gabriel 2026-09-23). La clave es lo que
// manda el frontend en `sortBy`; el valor es la columna real. `sortBy` fuera de
// esta lista NO se concatena en el SQL: se ignora y queda el orden por defecto.
const CAMPOS_ORDEN = {
  id: 'id',
  dealName: 'deal_name',
  stage: 'stage',
  etapa: 'etapa',
  referenciaRecaudo: 'referencia_recaudo',
  otroSiRequerido: 'otro_si_requerido',
  encargadoOtroSi: 'encargado_otro_si',
  otroSiTieneArchivo: 'otro_si_tiene_archivo',
  verificado: 'verificado',
};

// Filtro en cascada Etapa -> Frente -> Torre (Jefe Gabriel, 2026-09-24), con
// los mismos valores y el mismo shape de respuesta que el de Negocios
// (`negocio.service.js`): sale del helper global `valoresProyectoTorre()`.
//
// Se filtra por el `Proyecto_Torre` del INVENTARIO asociado, que es el mismo
// dato que ya se resuelve para la columna `inmueble` -- pero el filtro tiene que
// pasar ANTES del LIMIT/OFFSET, así que no se puede filtrar en JS sobre la
// página: primero se resuelve la lista de `referencia_recaudo` que caen en la
// rama elegida de la cascada (`referenciasPorProyectoTorre`/
// `referenciasSinProyecto`, `inventarioTorres.service.js`) y con ella se arma
// el `where`.
//
// OJO con la homonimia: el query param `etapa` (y `etapasDisponibles`) son la
// ETAPA DEL INMUEBLE, valores tipo '2' / 'Isla Laguna' que devuelve
// `obtenerEtapaTorre`; el campo `etapa` de cada fila es la ETAPA DEL PROYECTO
// ('Etapa 1'..'Etapa 8') y `stage` es la ETAPA DEL NEGOCIO. Son tres cosas
// distintas -- el frontend conviene etiquetarlas distinto en la tabla.
async function listOtrosi({ search, requerido, stage, sortBy, sortDir, etapa, frente, torre, verificado, page = 1, limit = 20 }) {
  const where = {};

  const requeridoLc = String(requerido || '').toLowerCase();
  if (requeridoLc === 'si' || requeridoLc === 'no') {
    where.otro_si_requerido = { [Op.iLike]: requeridoLc[0] === 'n' ? 'n%' : 's%' };
  }

  // Filtro del check manual (Jefe Gabriel, 2026-09-24) -- mismo criterio 'si'/'no'
  // que `requerido`, pero acá es un BOOLEAN real (no un picklist de Zoho), así
  // que el match es exacto, no por prefijo.
  const verificadoLc = String(verificado || '').toLowerCase();
  if (verificadoLc === 'si' || verificadoLc === 'no') {
    where.verificado = verificadoLc === 'si';
  }

  // Filtro de ETAPA DEL NEGOCIO (Jefe Gabriel, 2026-09-23) -- `Stage` de Zoho,
  // el estado de negociación real ('1 INTERESADO', '12BC VINCULACION A FIDUCIA
  // EXITOSA', ...). Match EXACTO, mismo criterio que `stage` en Oportunidades;
  // los valores salen de `listStages()`. OJO: NO es la columna `etapa` (etapa de
  // construcción), que queda como dato interno y NO se expone.
  if (stage) where.stage = stage;

  // Filtro en cascada Etapa -> Frente -> Torre. Si el usuario NO filtra por
  // ninguno, los otrosíes sin inmueble asociado (null) siguen apareciendo igual
  // que ahora; si filtra por cualquiera de los 3, quedan excluidos (mismo
  // criterio que en Negocios).
  const valores = await valoresProyectoTorre();
  if (etapa || frente || torre) {
    if (etapa === SIN_PROYECTO) {
      const sinProyecto = await referenciasSinProyecto();
      const conProyecto = await referenciasPorProyectoTorre([...valores.porEtapa.values()].flat());
      where.referencia_recaudo = { [Op.or]: [{ [Op.is]: null }, { [Op.notIn]: conProyecto }, { [Op.in]: sinProyecto }] };
    } else {
      let proyectosTorre = [];
      if (frente && torre) proyectosTorre = valores.porFrenteTorre.get(`${frente}||${torre}`) || [];
      else if (frente) proyectosTorre = valores.porFrente.get(frente) || [];
      else if (etapa) proyectosTorre = valores.porEtapa.get(etapa) || [];
      // Lista vacía -> `IN ()` deja el listado sin filas, que es lo correcto: el
      // usuario pidió una rama de la cascada que no tiene inmuebles.
      where.referencia_recaudo = { [Op.in]: await referenciasPorProyectoTorre(proyectosTorre) };
    }
  }

  // Filtro DURO y permanente (Jefe Gabriel, 2026-09-23): el listado expuesto al
  // frontend SOLO muestra los registros con archivo=true, siempre -- sin
  // excepciones por parámetros. Los NULL/false se siguen trackeando en la tabla
  // por sync/backfill internos, pero jamás salen por GET /otrosies. El param
  // `archivo` quedó sin efecto (los `no`/`pendiente` no se negocian acá).
  where.otro_si_tiene_archivo = true;

  if (search) {
    // Búsqueda SIMPLE por substring (decisión del Jefe Gabriel 2026-09-24: se
    // revirtió la búsqueda tolerante por palabras + trigramas en todos los
    // módulos). Match por `ILIKE '%término%'` sobre el nombre del deal y sobre
    // la Referencia de Recaudo (esta última se pidió aparte, para poder buscar
    // por número desde la misma caja).
    const like = `%${String(search).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where[Op.or] = [{ deal_name: { [Op.iLike]: like } }, { referencia_recaudo: { [Op.iLike]: like } }];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  // Orden server-side ANTES de la paginación (si no, ordenar solo reordenaría
  // la página actual). Sin orden por similitud: se revirtió con la búsqueda
  // tolerante. 'inmueble' no es una columna real de esta tabla (se resuelve
  // por fuera, ver `inmueblesPorReferencia` más abajo) -- no puede pasar por
  // el whitelist genérico de `ordenSequelize`, necesita su propia subquery
  // (`ordenLiteralInmueble`, `inventarioTorres.service.js`).
  const order = sortBy === 'inmueble'
    ? [ordenLiteralInmueble('Otrosi', sortDir), ['id', 'ASC']]
    : ordenSequelize({ sortBy, sortDir, campos: CAMPOS_ORDEN, porDefecto: [['deal_name', 'ASC'], ['id', 'ASC']] });

  const { rows, count } = await Otrosi.findAndCountAll({
    where,
    include: [{ model: Usuario, as: 'verificadoPor', attributes: ['id', 'nombre'] }],
    offset: (pageNum - 1) * limitNum,
    limit: limitNum,
    order,
  });

  const inmueblesPorRef = await inmueblesPorReferencia(rows.map((r) => r.referencia_recaudo));

  return {
    data: rows.map((row) => ({
      id: row.id,
      dealName: row.deal_name,
      // Son DOS campos distintos y el Jefe Gabriel quiere ver los DOS en la
      // tabla (aclaración 2026-09-23): `stage` = Etapa del NEGOCIO (pipeline,
      // 'Stage' de Zoho: '12BC VINCULACION A FIDUCIA EXITOSA') y `etapa` = Etapa
      // del PROYECTO (fase de construcción, 'Etapa 1'..'Etapa 8', la que
      // particiona el sync). Antes se había sacar `etapa` de la API por
      // error, pensando que era lo mismo que `stage` -- restaurado.
      stage: row.stage,
      etapa: row.etapa,
      referenciaRecaudo: row.referencia_recaudo,
      // Columna 'Inmueble': objeto con las 4 partes (mismas del Dashboard) + el
      // texto listo para pintar. `null` cuando la referencia no matchea ningún
      // inventario_item (el frontend muestra 'Sin inmueble').
      inmueble: mapInmueble(inmuebleDeFila(row, inmueblesPorRef)),
      otroSiRequerido: row.otro_si_requerido,
      // Se sigue exponiendo aunque el Jefe pidiera ocultar la columna: dijo
      // "hasta nuevo aviso", así que no se borra de modelo/sync/backfill.
      encargadoOtroSi: row.encargado_otro_si,
      otroSiTieneArchivo: row.otro_si_tiene_archivo,
      // Check manual de verificación contra el CRM (Jefe Gabriel, 2026-09-24)
      // -- `verificadoPor`/`verificadoEn` quedan `null` cuando `verificado`
      // es `false` (nunca se marcó, o se desmarcó explícitamente).
      verificado: row.verificado,
      verificadoPor: row.verificadoPor ? { id: row.verificadoPor.id, nombre: row.verificadoPor.nombre } : null,
      verificadoEn: row.verificado_en,
    })),
    pagination: { total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil(count / limitNum) },
    // Cascada de filtros del inmueble (mismo shape que el de Negocios), para
    // que el frontend no los escriba a mano.
    etapasDisponibles: [...valores.porEtapa.keys(), SIN_PROYECTO].sort(compararEtapas),
    frentesDisponibles: [...valores.porFrente.keys()].filter(esFrenteSeleccionable).sort(),
    frentesPorEtapa: valores.frentesPorEtapa,
    torresPorFrente: valores.torresPorFrente,
    torresPorEtapaFrente: valores.torresPorEtapaFrente,
  };
}

// Valores distintos de `stage` (ETAPA DEL NEGOCIO de Zoho) para poblar el Select
// del filtro -- mismo criterio que `listStages()` de Oportunidades. Se limita al
// MISMO universo que ve el listado (archivo=true) para no ofrecer opciones que
// siempre darían 0 resultados — el filtro duro de `otro_si_tiene_archivo` es
// permanente.
async function listStages() {
  const rows = await Otrosi.findAll({
    attributes: ['stage'],
    where: { stage: { [Op.ne]: null }, otro_si_tiene_archivo: true },
    group: ['stage'],
    order: [['stage', 'ASC']],
    raw: true,
  });
  return rows.map((r) => r.stage).filter(Boolean);
}

// Descarga BAJO DEMANDA (un Deal a la vez, cuando el usuario hace click) del
// PDF de 'Otro sí - Contrato Fiducia', haciendo streaming directo desde Zoho.
// NUNCA se guarda el archivo en BD ni en disco (decisión del Jefe Gabriel:
// sincronizar/cachear 6663 PDFs no vale la pena). Meredith está confirmando el
// Mecanismo de descarga confirmado por Meredith (2026-09-23, probado en vivo
// con el Deal de Mauro Cardone, 351296 bytes): el campo fileupload
// `Otro_si_Contrato_Fiducia` NO se lista por /Deals/{id}/Attachments ni se
// descarga por /Deals/{id}/actions/download_file (responde 200 '{}').
// Camino real, con el token actual y sin scope nuevo:
//   1) GET /crm/v2/Deals/{id}?fields=Otro_si_Contrato_Fiducia -> array con
//      metadata por archivo; tomar data[0].Otro_si_Contrato_Fiducia[0].attachment_Id
//   2) GET /crm/v2/Attachments/{attachment_Id} con header
//      Authorization Zoho-oauthtoken <token> -> binario real del PDF.
async function getArchivo(id) {
  const item = await Otrosi.findByPk(id, { attributes: ['id', 'zoho_deal_id', 'otro_si_tiene_archivo'] });
  if (!item) throw new ApiError(404, 'Registro de Otrosí no encontrado');
  if (!item.otro_si_tiene_archivo) throw new ApiError(404, 'Este registro no tiene archivo de Otro sí cargado');

  async function hallarAttachmentId(token) {
    const r = await axios
      .get(`${zohoConfig.apiBase}/Deals/${item.zoho_deal_id}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        params: { fields: 'Otro_si_Contrato_Fiducia' },
        validateStatus: (s) => s < 400,
      });
    const archivos = r.data?.data?.[0]?.Otro_si_Contrato_Fiducia;
    const attachmentId = archivos?.[0]?.attachment_Id;
    if (!Array.isArray(archivos) || !archivos.length || !attachmentId) {
      throw new ApiError(404, 'Este registro no tiene archivo de Otro sí cargado');
    }
    return attachmentId;
  }

  async function descargar(token) {
    const attachmentId = await hallarAttachmentId(token);
    return axios.get(`${zohoConfig.apiBase}/Attachments/${encodeURIComponent(attachmentId)}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      responseType: 'stream',
      validateStatus: (s) => s < 400,
    });
  }

  let response;
  try {
    response = await descargar(await getAccessToken());
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err.response?.status === 401) {
      _clearCache();
      response = await descargar(await getAccessToken());
    } else {
      throw new ApiError(502, `Zoho no pudo entregar el archivo: ${err.message}`);
    }
  }

  // El header de Zoho viene como `attachment; filename=...` -- acá solo
  // extraemos el nombre real; quien streamea (controller) lo re-emite SIEMPRE
  // como `inline` (ver decisión del Jefe Gabriel: el PDF debe abrirse en el
  // visor del navegador, no descargarse).
  const fileName = extraerFileName(response.headers['content-disposition']);

  return {
    stream: response.data,
    contentType: response.headers['content-type'] || 'application/pdf',
    contentLength: response.headers['content-length'],
    fileName,
  };
}

// Marca/desmarca el check manual de verificación (Jefe Gabriel, 2026-09-24):
// un encargado comparó el documento del otrosí contra el plan de pagos del
// CRM y (si hacía falta) lo corrigió. `usuarioId` SIEMPRE viene de la sesión
// autenticada (`req.usuario.id`, ver `otrosi.controller.js`), nunca del body
// -- así `verificadoPor` es confiable como auditoría real, no un dato que el
// cliente pueda falsificar. Desmarcar (`valor: false`) limpia también
// `verificadoPor`/`verificadoEn` -- un check "no verificado" no debe mostrar
// quién lo verificó la última vez, eso confundiría a quien lo mire después.
async function marcarVerificado(id, usuarioId, valor) {
  const item = await Otrosi.findByPk(id);
  if (!item) throw new ApiError(404, 'Registro de Otrosí no encontrado');

  await item.update(
    valor
      ? { verificado: true, verificado_por_id: usuarioId, verificado_en: new Date() }
      : { verificado: false, verificado_por_id: null, verificado_en: null }
  );

  const conUsuario = await Otrosi.findByPk(id, { include: [{ model: Usuario, as: 'verificadoPor', attributes: ['id', 'nombre'] }] });
  return {
    id: conUsuario.id,
    verificado: conUsuario.verificado,
    verificadoPor: conUsuario.verificadoPor ? { id: conUsuario.verificadoPor.id, nombre: conUsuario.verificadoPor.nombre } : null,
    verificadoEn: conUsuario.verificado_en,
  };
}

function extraerFileName(disposition) {
  if (typeof disposition !== 'string') return 'otro-si-fiducia.pdf';
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^;"]+)/i);
  const raw = match ? match[1] : 'otro-si-fiducia.pdf';
  // Zoho manda el nombre percent-encoded (ej. `%C3%AD`) -- se decodifica para
  // no dejar la basura en el header `inline; filename=`.
  let decoded = raw;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(raw)) decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const limpio = decoded.replace(/[\\/:*?"<>|]/g, '').trim();
  return limpio || 'otro-si-fiducia.pdf';
}

module.exports = { listOtrosi, listStages, getArchivo, marcarVerificado };