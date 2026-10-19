// Helpers compartidos entre los módulos de Oliv (olivOportunidad,
// olivNegocio) que necesitan lo mismo de HubSpot -- extraído acá para no
// duplicar entre ambos service.js.

// Posición 0-indexada mínima de etapa (Etapa 1 = 0) que cuenta como
// "negocio" en Oliv -- originalmente Etapa 6 (pedido del usuario,
// 2026-09-11: "que muestre todas las que tenga etapa 6 y superiores"),
// subida a Etapa 8 (pedido del usuario, 2026-09-14: "la idea es que vengan
// solo los de etapa 8 en adelante, ni etapa 7 ni etapa 6 ni 5 para abajo").
// Compartida entre olivOportunidad.sync.js (filtra el propio fetch a
// HubSpot, no solo la lectura local -- pedido explícito del usuario: "no es
// la idea, la idea es que solo traigas las que cumplen con los
// requisitos"), olivOportunidad.service.js y olivNegocio.service.js.
const ETAPA_MINIMA_ORDER = 7; // Etapa 8 (0-indexado: Etapa 1 = 0)

// Id de HubSpot de la etapa "Etapa 8 - Vinculación exitosa" del pipeline de deals de Oliv. HubSpot guarda la
// fecha en que cada deal ENTRÓ a una etapa en la propiedad `hs_v2_date_entered_<idEtapa>`; se usa como
// "fecha de contrato" (Jefe Gabriel, 2026-10-19: "la fecha que entró en etapa 8"). Verificado el mismo día:
// los 19 deals de Etapa 8+ la traen.
const ETAPA_8_STAGE_ID = '1282912352';

function _escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// `nombre_contacto` en HubSpot suele traer el nombre del proyecto pegado
// adelante (ej. "Oliv - Juliana Escalante", a veces hasta duplicado: "Oliv -
// Oliv - piloto pruebar") -- se lo quita para dejar solo el nombre de la
// persona, que es lo que se muestra como "Contacto"/"Comprador" en toda la
// UI de Oliv (pedido explícito del usuario, 2026-09-11). Si no hay proyecto
// o el nombre no tiene el prefijo, se devuelve tal cual.
function limpiarNombreContacto(nombreContacto, proyecto) {
  if (!nombreContacto || !proyecto) return nombreContacto;
  const prefijo = new RegExp(`^(\\s*${_escapeRegExp(proyecto)}\\s*-\\s*)+`, 'i');
  const limpio = nombreContacto.replace(prefijo, '').trim();
  return limpio || nombreContacto;
}

// El Excel de Encargos ("Saldos Acumulados por Concepto y Unidad") trae los
// montos con formato inconsistente en la misma columna: unas filas
// "29601.78" (plano), otras "$2,000,000." (separador de miles + un punto
// final sin decimales detrás -- así viene el archivo real de la
// fiduciaria, no es un error nuestro). Compartida entre olivEncargo.service.js
// (columna "Valor" de Movimientos) y olivNegocio.service.js (Aportes/
// Rendimientos Brutos/Valor de la unidad).
function parseValorFiducia(v) {
  if (v == null || v === '') return null;
  let s = String(v).replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  if (s.endsWith('.')) s = s.slice(0, -1);
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Busca en `datos` (objeto plano de una fila del Excel) la primera clave
// que calce, sin distinguir mayúsculas, con alguno de los `nombres` --
// compartida por olivEncargo.service.js para leer columnas conocidas del
// Excel de Encargos (VALOR, CONCEPTO, ENCARGO) sin depender de que vengan
// exactamente en mayúsculas.
function buscarCampo(datos, nombres) {
  if (!datos) return null;
  const keys = Object.keys(datos);
  for (const nombre of nombres) {
    const key = keys.find((k) => k.toLowerCase() === nombre.toLowerCase());
    if (key && datos[key] != null && datos[key] !== '') return datos[key];
  }
  return null;
}

// Como buscarCampo, pero devuelve el NOMBRE de la columna que calzó (no su
// valor) -- para poder excluir esa columna del detalle crudo cuando ese
// mismo dato ya se muestra en una columna dedicada (Propietario/Concepto/
// Valor de la lista de Movimientos de Oliv) -- pedido explícito del
// usuario: "lo que aparece en la columna no debe aparecer en el detalle".
function buscarClave(datos, nombres) {
  if (!datos) return null;
  const keys = Object.keys(datos);
  for (const nombre of nombres) {
    const key = keys.find((k) => k.toLowerCase() === nombre.toLowerCase());
    if (key && datos[key] != null && datos[key] !== '') return key;
  }
  return null;
}

// Nombres de columna conocidos del Excel de Encargos "Saldos Acumulados por
// Concepto y Unidad" -- compartidos entre olivEncargo.service.js (lista de
// Movimientos) y olivNegocio.service.js (Historial de movimientos dentro de
// un Negocio) para que las dos vistas excluyan las MISMAS columnas del
// detalle crudo (las que ya se muestran en una columna dedicada).
const COLUMNAS_REFERENCIA_FIDUCIA = ['ENCARGO', 'REFERENCIA', 'REFERENCIA DE RECAUDO'];
const COLUMNAS_VALOR_FIDUCIA = ['VALOR', 'MONTO', 'VALOR MOVIMIENTO'];
const COLUMNAS_CONCEPTO_FIDUCIA = ['CONCEPTO', 'COD_CONCEPTO', 'TIPO MOVIMIENTO'];
const COLUMNAS_PROPIETARIO_FIDUCIA = ['propietario', 'titular', 'cliente', 'nombre', 'comprador'];

// Todo `datos` de una fila del Excel de Encargos, MENOS las columnas que ya
// se muestran en una columna/campo dedicado (Propietario/Concepto/Valor/
// Encargo) -- pedido explícito del usuario: "lo que aparece en la columna
// no debe aparecer en el detalle". Usado tanto por la lista de Movimientos
// de Oliv como por el Historial de movimientos dentro de un Negocio.
function detalleSinDuplicar(datos) {
  const clavesOcultas = new Set(
    [
      buscarClave(datos, COLUMNAS_VALOR_FIDUCIA),
      buscarClave(datos, COLUMNAS_CONCEPTO_FIDUCIA),
      buscarClave(datos, COLUMNAS_PROPIETARIO_FIDUCIA),
      buscarClave(datos, COLUMNAS_REFERENCIA_FIDUCIA),
    ].filter(Boolean)
  );
  return Object.fromEntries(Object.entries(datos || {}).filter(([k]) => !clavesOcultas.has(k)));
}

// "Rendimientos Brutos" (COD_CONCEPTO='RB' en el Excel de Encargos) es
// rendimiento del fideicomiso, no plata abonada por el comprador -- pedido
// explícito del usuario (2026-09-15): "esos movimientos no debe
// importarlos... no los cargue en los movimientos, solo los APORTES", y
// confirmado después ("sacarlos de todo el sistema") que no deben quedar ni
// siquiera guardados como OlivMovimiento. Usado por olivEncargo.upload.js
// para filtrarlos ANTES de guardarlos (la Hoja cruda del Excel, en cambio,
// sí guarda el archivo completo tal cual se subió -- ver el comentario de
// cabecera de ese archivo).
function esRendimientoBruto(datos) {
  const concepto = buscarCampo(datos, COLUMNAS_CONCEPTO_FIDUCIA);
  if (!concepto) return false;
  const c = String(concepto).trim().toUpperCase();
  return c === 'RB' || c.includes('RENDIMIENTO');
}

module.exports = {
  limpiarNombreContacto,
  ETAPA_MINIMA_ORDER,
  ETAPA_8_STAGE_ID,
  parseValorFiducia,
  buscarCampo,
  buscarClave,
  detalleSinDuplicar,
  esRendimientoBruto,
  COLUMNAS_REFERENCIA_FIDUCIA,
  COLUMNAS_VALOR_FIDUCIA,
  COLUMNAS_CONCEPTO_FIDUCIA,
  COLUMNAS_PROPIETARIO_FIDUCIA,
};
