// Adaptado de zoho-payment-tracker/backend/src/baia-kristal/services/configuracionFrenteService.js.
const { Op } = require('sequelize');
const ApiError = require('../../../utils/ApiError');
const ConfiguracionFrente = require('./baiaConfiguracionFrente.model');
const { valoresProyectoTorre, pisosPorFrenteTorre } = require('../baiaInventario/baiaInventarioTorres.service');
const { invalidarCacheDashboard } = require('../baiaDashboard/baiaDashboardCache');

// Valor especial de "torre"/"piso" que representa "todas" (una sola fecha
// para todo lo que esté debajo de ese nivel), guardado en la misma tabla
// que las torres/pisos individuales -- así el mismo modelo/índice único
// sirve para los tres niveles sin agregar tablas aparte.
const CLAVE_TODAS = '__TODAS__';

function _enrich(config) {
  const data = config.toJSON();
  return {
    frente: data.frente,
    torre: data.torre === CLAVE_TODAS ? null : data.torre,
    piso: data.piso === CLAVE_TODAS ? null : data.piso,
    fechaEntrega: data.fecha_entrega,
  };
}

function _clave(frente, torre, piso) {
  return `${frente}||${torre}||${piso}`;
}

// Lista plana de las tres jerarquías posibles por Frente -- "todo el
// proyecto", "toda la torre" y cada piso individual -- con su fecha de
// entrega configurada, si la hay. Se listan TODAS las combinaciones
// conocidas del inventario (no solo las que ya tienen configuración) para
// que la pantalla muestre una fila lista para completar en cada nivel.
async function list() {
  const [{ torresPorFrente }, pisosPorTorre, configs] = await Promise.all([
    valoresProyectoTorre(),
    pisosPorFrenteTorre(),
    ConfiguracionFrente.findAll(),
  ]);
  const configPorClave = new Map(configs.map((c) => [_clave(c.frente, c.torre, c.piso), c]));

  const filas = [];
  for (const frente of Object.keys(torresPorFrente).sort()) {
    filas.push({
      frente,
      torre: null,
      piso: null,
      fechaEntrega: configPorClave.get(_clave(frente, CLAVE_TODAS, CLAVE_TODAS))?.fecha_entrega ?? null,
    });
    for (const torre of torresPorFrente[frente]) {
      filas.push({
        frente,
        torre,
        piso: null,
        fechaEntrega: configPorClave.get(_clave(frente, torre, CLAVE_TODAS))?.fecha_entrega ?? null,
      });
      const pisos = pisosPorTorre[frente]?.[torre] ?? [];
      for (const piso of pisos) {
        filas.push({
          frente,
          torre,
          piso,
          fechaEntrega: configPorClave.get(_clave(frente, torre, piso))?.fecha_entrega ?? null,
        });
      }
    }
  }
  return filas;
}

// Mapa simple { "Frente||Torre||Piso": fechaEntrega } para consumo interno
// de dashboard.service.js -- solo las combinaciones que SÍ tienen fecha
// configurada, con el sentinela CLAVE_TODAS tal cual (no traducido a null,
// a diferencia de list()) para que el resolver del dashboard pueda
// construir las tres claves de fallback directamente (piso -> torre -> proyecto).
async function obtenerFechasEntregaConfiguradas() {
  const configs = await ConfiguracionFrente.findAll({ where: { fecha_entrega: { [Op.ne]: null } } });
  // DATEONLY devuelve un string 'YYYY-MM-DD', no un Date -- gotcha real
  // encontrado con datos reales (con datos sintéticos fecha_entrega siempre
  // era null, así que esto nunca se había ejercitado): dashboard.service.js
  // usa este valor como `fechaEstimada` de una cuota, y el resto del motor
  // de conciliación (mesKey/diaKey, etc.) asume que toda fechaEstimada es un
  // Date real (llama .getUTCFullYear() directo).
  return new Map(configs.map((c) => [_clave(c.frente, c.torre, c.piso), new Date(c.fecha_entrega)]));
}

// Los tres niveles son mutuamente excluyentes entre sí: solo uno puede
// tener una fecha activa para una torre/proyecto dado. Si no, quedaría
// ambiguo cuál manda -- hay que borrar el otro nivel antes de configurar.
// Cualquier cambio acá afecta el cálculo de conciliación de todo el
// portafolio (Dashboard/Cartera en Gestión/Resumen) -- invalidar el cache.

async function actualizarFechaEntregaProyecto(frente, fechaEntrega) {
  if (fechaEntrega) {
    const conflicto = await ConfiguracionFrente.findOne({
      where: { frente, fecha_entrega: { [Op.ne]: null }, torre: { [Op.ne]: CLAVE_TODAS } },
    });
    if (conflicto) {
      throw new ApiError(409, `"${frente}" ya tiene fechas configuradas por torre o por piso. Bórralas primero para configurar una fecha única para todo el proyecto.`);
    }
  }
  const [config] = await ConfiguracionFrente.upsert(
    { frente, torre: CLAVE_TODAS, piso: CLAVE_TODAS, fecha_entrega: fechaEntrega },
    { conflictFields: ['frente', 'torre', 'piso'] }
  );
  invalidarCacheDashboard();
  return _enrich(config);
}

async function actualizarFechaEntregaTorre(frente, torre, fechaEntrega) {
  if (fechaEntrega) {
    const proyecto = await ConfiguracionFrente.findOne({ where: { frente, torre: CLAVE_TODAS, piso: CLAVE_TODAS } });
    if (proyecto?.fecha_entrega) {
      throw new ApiError(409, `"${frente}" ya tiene una fecha configurada para todo el proyecto. Bórrala primero para configurar esta torre por separado.`);
    }
    const conPisos = await ConfiguracionFrente.findOne({
      where: { frente, torre, piso: { [Op.ne]: CLAVE_TODAS }, fecha_entrega: { [Op.ne]: null } },
    });
    if (conPisos) {
      throw new ApiError(409, `"${frente}" Torre ${torre} ya tiene fechas configuradas por piso. Bórralas primero para configurar una fecha única para toda la torre.`);
    }
  }
  const [config] = await ConfiguracionFrente.upsert(
    { frente, torre, piso: CLAVE_TODAS, fecha_entrega: fechaEntrega },
    { conflictFields: ['frente', 'torre', 'piso'] }
  );
  invalidarCacheDashboard();
  return _enrich(config);
}

async function actualizarFechaEntregaPiso(frente, torre, piso, fechaEntrega) {
  if (fechaEntrega) {
    const proyecto = await ConfiguracionFrente.findOne({ where: { frente, torre: CLAVE_TODAS, piso: CLAVE_TODAS } });
    if (proyecto?.fecha_entrega) {
      throw new ApiError(409, `"${frente}" ya tiene una fecha configurada para todo el proyecto. Bórrala primero para configurar este piso por separado.`);
    }
    const torreConfig = await ConfiguracionFrente.findOne({ where: { frente, torre, piso: CLAVE_TODAS } });
    if (torreConfig?.fecha_entrega) {
      throw new ApiError(409, `"${frente}" Torre ${torre} ya tiene una fecha configurada para toda la torre. Bórrala primero para configurar este piso por separado.`);
    }
  }
  const [config] = await ConfiguracionFrente.upsert(
    { frente, torre, piso, fecha_entrega: fechaEntrega },
    { conflictFields: ['frente', 'torre', 'piso'] }
  );
  invalidarCacheDashboard();
  return _enrich(config);
}

module.exports = {
  list,
  obtenerFechasEntregaConfiguradas,
  actualizarFechaEntregaProyecto,
  actualizarFechaEntregaTorre,
  actualizarFechaEntregaPiso,
  CLAVE_TODAS,
};
