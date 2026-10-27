// "Registros vinculados": dado un registro (Oportunidad, Negocio o Inmueble)
// devuelve los otros dos con lo mínimo para pintar un enlace (a dónde ir, un
// título y un detalle corto), para la franja "Vinculados" de las pantallas de
// detalle. No duplica reglas de cruce: reutiliza las que ya usan Negocios
// (Baía Kristal) y Negocios/Oportunidades (Oliv).
//
// Baía Kristal cruza por la REFERENCIA DE RECAUDO (Negocio.referencia =
// Oportunidad.referencia_recaudo = InventarioItem.referencia_recaudo) y, si el
// inmueble no la tiene, por la nomenclatura (Negocio.datos.Nomenclatura =
// InventarioItem.datos.C_digo_inmueble). Oliv: la oportunidad apunta al
// inmueble por `inmueble_hubspot_id`, y el "negocio" ES la oportunidad cuando
// llegó a la etapa mínima (ver olivNegocio.service.js).
//
// Cada vínculo se entrega solo si el usuario puede abrir el módulo destino; si
// no, llega como { restringido: true } (el frontend lo muestra bloqueado, sin
// revelar nombres de un módulo al que no tiene acceso).
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const ApiError = require('../../../utils/ApiError');
const { tienePermiso, getRolesPermisos } = require('../../../utils/permisos');
const { limpiarNombreContacto, ETAPA_MINIMA_ORDER } = require('../../../utils/olivHelpers');
const Negocio = require('../baiaNegocio/baiaNegocio.model');
const Oportunidad = require('../baiaOportunidad/baiaOportunidad.model');
const InventarioItem = require('../baiaInventario/baiaInventarioItem.model');
const dashboardService = require('../baiaDashboard/baiaDashboard.service');
const olivResumenService = require('../../oliv/olivResumen/olivResumen.service');
const { esEtapaDesistida, ESTADOS_DESISTIDOS } = require('../../../config/estadosOportunidad');
const { findOportunidadByReferencia, resolverNegocioIdDesdeInmueble } = require('../baiaNegocio/baiaNegocio.service');
const olivOportunidad = require('../../oliv/olivOportunidad/olivOportunidad.model');
const OlivInmueble = require('../../oliv/olivInmueble/olivInmueble.model');

const TIPOS = ['oportunidad', 'negocio', 'inmueble'];
const MODULOS = {
  baia: { oportunidad: 'oportunidades', negocio: 'negocios', inmueble: 'inventario', cartera: 'cartera-mora' },
  oliv: { oportunidad: 'oliv-oportunidades', negocio: 'oliv-negocios', inmueble: 'oliv-inmuebles', cartera: 'oliv-cartera-mora' },
};

// ── Cartera (mora) ───────────────────────────────────────────────────────
// Si la unidad está en mora según la conciliación, se ofrece un enlace directo a Cartera en Gestión, ya filtrado a ese negocio.
const pesos = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0);

function moraDeFila(f) {
  if (f.cuotasEnMoraInicial > 0) {
    return { vista: 'inicial', monto: f.montoEnMoraInicial, dias: f.maxDiasAtrasoInicial, via: 'Cuota inicial vencida según la conciliación' };
  }
  if (f.saldoContraentregaVencido) {
    return { vista: 'contraentrega', monto: f.pendienteSaldoContraentrega, dias: f.diasAtrasoSaldoContraentrega, via: 'Saldo contraentrega vencido según la conciliación' };
  }
  return null;
}

function armarCartera(f, ruta, buscar) {
  const mora = moraDeFila(f);
  if (!mora) return null;
  const params = new URLSearchParams({ vista: mora.vista, buscar });
  if (f.esCanje) params.set('tramite', 'canje');
  return {
    to: `${ruta}?${params.toString()}`,
    titulo: 'En mora',
    detalle: `${pesos(mora.monto)}${mora.dias != null ? ` · ${mora.dias} días de atraso` : ''}`,
    via: mora.via,
  };
}

async function carteraBaia(inmueble, negocio) {
  if (!inmueble || !negocio) return null;
  const { filas } = await dashboardService.precalentarCache();
  const f = filas.find((x) => x.id === inmueble.id);
  return f ? armarCartera(f, '/cartera-mora', f.referencia ?? negocio.referencia) : null;
}

// ── Baía Kristal ─────────────────────────────────────────────────────────

async function inmuebleDeNegocio(negocio) {
  // El inmueble del negocio lo decide vinculoResolver.js (tabla vinculos_negocio_inmueble).
  if (!negocio.referencia) return null;
  const rows = await sequelize.query('SELECT inventario_id FROM vinculos_negocio_inmueble WHERE referencia = $1', {
    bind: [negocio.referencia],
    type: QueryTypes.SELECT,
  });
  return rows[0]?.inventario_id ? InventarioItem.findByPk(rows[0].inventario_id) : null;
}

// Oportunidad caída (BACKOUT, desistida...) que comparte la referencia con OTRA oportunidad vigente: el inmueble del
// negocio es de la vigente, no de esta. Si es la única con esa referencia, sigue siendo la dueña del negocio.
async function esDesistidaConOtraVigente(opp) {
  if (!esEtapaDesistida(opp.stage) || !opp.referencia_recaudo) return false;
  const vigentes = await Oportunidad.count({
    where: { referencia_recaudo: opp.referencia_recaudo, id: { [Op.ne]: opp.id }, stage: { [Op.notIn]: [...ESTADOS_DESISTIDOS] } },
  });
  return vigentes > 0;
}

// Cómo quedó vinculado un negocio con su inmueble (lo guarda vinculoResolver.js en `metodo`).
const VIA_METODO = {
  nomenclatura: 'Por nomenclatura y categoría del negocio',
  referencia: 'Por referencia de recaudo',
};
async function viaNegocioInmueble(negocio) {
  if (!negocio?.referencia) return null;
  const rows = await sequelize.query('SELECT metodo FROM vinculos_negocio_inmueble WHERE referencia = $1', { bind: [negocio.referencia], type: QueryTypes.SELECT });
  return VIA_METODO[rows[0]?.metodo] ?? null;
}

async function resolverBaia(tipo, id) {
  let oportunidad = null; // { id, dealName, stage }
  let negocio = null;
  let inmueble = null;
  let ocultarInmueble = false;
  let inmuebleDeLaOportunidad = false; // el inmueble salió del campo Inmueble que la oportunidad tiene en Zoho

  if (tipo === 'oportunidad') {
    const opp = await Oportunidad.findByPk(id, { attributes: ['id', 'deal_name', 'stage', 'referencia_recaudo', 'seccion_inmueble'] });
    if (!opp) throw new ApiError(404, 'Oportunidad no encontrada');
    oportunidad = { id: opp.id, dealName: opp.deal_name, stage: opp.stage };
    ocultarInmueble = await esDesistidaConOtraVigente(opp);
    const referencia = opp.referencia_recaudo;
    if (referencia) {
      negocio = await Negocio.findOne({ where: { referencia } });
      // El inmueble propio de la oportunidad (el que tiene en Zoho) manda; si no tiene, el del negocio, salvo que la
      // oportunidad esté caída (BACKOUT, desistida...): esa comparte la referencia con la vigente pero no es dueña del inmueble.
      const propioZohoId = opp.seccion_inmueble?.Inmueble?.id;
      if (propioZohoId) inmueble = await InventarioItem.findOne({ where: { zoho_id: String(propioZohoId) } });
      if (inmueble) inmuebleDeLaOportunidad = true;
      if (!inmueble && !(await esDesistidaConOtraVigente(opp))) {
        inmueble = (negocio ? await inmuebleDeNegocio(negocio) : null) ?? (await InventarioItem.findOne({ where: { referencia_recaudo: referencia }, order: [['id', 'ASC']] }));
      }
    }
  } else if (tipo === 'inmueble') {
    inmueble = await InventarioItem.findByPk(id);
    if (!inmueble) throw new ApiError(404, 'Inmueble no encontrado');
    const negocioId = await resolverNegocioIdDesdeInmueble(inmueble);
    if (negocioId) negocio = await Negocio.findByPk(negocioId);
  } else if (String(id).startsWith('inv-')) {
    inmueble = await InventarioItem.findByPk(String(id).slice(4));
    if (!inmueble) throw new ApiError(404, 'Negocio no encontrado');
    const negocioId = await resolverNegocioIdDesdeInmueble(inmueble);
    if (negocioId) negocio = await Negocio.findByPk(negocioId);
  } else if (String(id).startsWith('neg-')) {
    negocio = await Negocio.findByPk(String(id).slice(4));
    if (!negocio) throw new ApiError(404, 'Negocio no encontrado');
  } else {
    throw new ApiError(404, 'Negocio no encontrado');
  }

  // Completa lo que falte con lo que ya se sabe.
  if (!inmueble && negocio && !(tipo === 'oportunidad' && ocultarInmueble)) inmueble = await inmuebleDeNegocio(negocio);
  if (!oportunidad) {
    const opp = await findOportunidadByReferencia(negocio?.referencia ?? inmueble?.referencia_recaudo ?? null);
    if (opp) oportunidad = { id: opp.id, dealName: opp.dealName, stage: opp.stage };
  }

  // "Vinculado por…": de qué forma se relaciona cada pieza con la que se está viendo.
  const viaMetodo = negocio && inmueble ? await viaNegocioInmueble(negocio) : null;
  const viaOportunidad = 'Por referencia de recaudo';
  const viaNegocio = tipo === 'oportunidad' ? 'Por referencia de recaudo' : viaMetodo;
  const cartera = await carteraBaia(inmueble, negocio);
  const viaInmueble = tipo === 'oportunidad' ? (inmuebleDeLaOportunidad ? 'Por el inmueble que declara la oportunidad en Zoho' : viaMetodo && `A través del negocio: ${viaMetodo.charAt(0).toLowerCase()}${viaMetodo.slice(1)}`) : viaMetodo;

  return {
    oportunidad: oportunidad
      ? { to: `/oportunidades/${oportunidad.id}`, titulo: oportunidad.dealName, detalle: oportunidad.stage, via: viaOportunidad }
      : null,
    negocio: negocio
      ? {
          // Mismo id que usa el listado de Negocios: por inmueble si hay uno.
          to: inmueble ? `/negocios/inv-${inmueble.id}` : `/negocios/neg-${negocio.id}`,
          titulo: negocio.referencia ? `Ref. ${negocio.referencia}` : 'Negocio',
          detalle: negocio.estado,
          via: viaNegocio,
        }
      : null,
    inmueble: inmueble
      ? { to: `/inventario/${inmueble.id}`, titulo: inmueble.datos?.Product_Name || inmueble.nombre || `Inmueble ${inmueble.id}`, detalle: inmueble.estado, via: viaInmueble }
      : null,
    cartera,
  };
}

// ── Oliv ─────────────────────────────────────────────────────────────────

async function oportunidadDeInmueble(inmueble) {
  return olivOportunidad.findOne({
    where: { inmueble_hubspot_id: inmueble.hubspot_id, stage_order: { [Op.gte]: ETAPA_MINIMA_ORDER } },
    order: [['actualizado_en', 'DESC']],
  });
}

async function resolverOliv(tipo, id) {
  let opp = null;
  let inmueble = null;
  const texto = String(id);

  if (tipo === 'oportunidad' || (tipo === 'negocio' && texto.startsWith('op-'))) {
    opp = await olivOportunidad.findByPk(texto.replace(/^op-/, ''));
    if (!opp) throw new ApiError(404, 'Oportunidad no encontrada');
    if (opp.inmueble_hubspot_id) inmueble = await OlivInmueble.findOne({ where: { hubspot_id: opp.inmueble_hubspot_id } });
  } else if (tipo === 'inmueble' || (tipo === 'negocio' && texto.startsWith('inm-'))) {
    inmueble = await OlivInmueble.findByPk(texto.replace(/^inm-/, ''));
    if (!inmueble) throw new ApiError(404, 'Inmueble no encontrado');
    opp = await oportunidadDeInmueble(inmueble);
  } else {
    throw new ApiError(404, 'Negocio no encontrado');
  }

  // Todo lo que se sincroniza ya está en la etapa mínima, pero se respeta la
  // misma condición que usa el detalle de Negocios.
  const esNegocio = opp && opp.stage_order >= ETAPA_MINIMA_ORDER;
  let cartera = null;
  if (esNegocio) {
    const { filas } = await olivResumenService.precalentarCache();
    const clave = inmueble ? `inm-${inmueble.id}` : `op-${opp.id}`;
    const f = filas.find((x) => x.id === clave);
    cartera = f ? armarCartera(f, '/oliv/cartera-mora', f.unidad ?? f.referencia ?? opp.referencia_recaudo ?? '') : null;
  }
  return {
    oportunidad: opp ? { to: `/oliv/oportunidades/${opp.id}`, titulo: opp.deal_name, detalle: opp.stage, via: 'Es el mismo registro: la oportunidad es el negocio' } : null,
    negocio: esNegocio
      ? {
          to: inmueble ? `/oliv/negocios/inm-${inmueble.id}` : `/oliv/negocios/op-${opp.id}`,
          titulo: opp.referencia_recaudo ? `Ref. ${opp.referencia_recaudo}` : opp.deal_name,
          detalle: limpiarNombreContacto(opp.nombre_contacto, opp.proyecto) || null,
          via: 'La oportunidad en etapa de venta es el negocio',
        }
      : null,
    inmueble: inmueble ? { to: `/oliv/inmuebles/${inmueble.id}`, titulo: inmueble.codigo_unidad, detalle: inmueble.estado, via: 'Por el inmueble asociado a la oportunidad en HubSpot' } : null,
    cartera,
  };
}

// ── Público ──────────────────────────────────────────────────────────────

async function obtener({ proyecto, tipo, id }, usuario) {
  if (!MODULOS[proyecto] || !TIPOS.includes(tipo)) throw new ApiError(400, 'Proyecto o tipo inválido');
  const vinculos = proyecto === 'baia' ? await resolverBaia(tipo, id) : await resolverOliv(tipo, id);

  const permisosPorRol = await getRolesPermisos();
  const resultado = {};
  for (const t of TIPOS) {
    if (t === tipo) continue; // el registro actual no se enlaza a sí mismo
    const v = vinculos[t];
    resultado[t] = v && !tienePermiso(usuario.roles, MODULOS[proyecto][t], permisosPorRol, usuario.esAdmin) ? { restringido: true } : v;
  }
  // Cartera: solo aparece si la unidad está en mora.
  if (vinculos.cartera) {
    resultado.cartera = tienePermiso(usuario.roles, MODULOS[proyecto].cartera, permisosPorRol, usuario.esAdmin) ? vinculos.cartera : { restringido: true };
  }
  return resultado;
}

module.exports = { obtener };
