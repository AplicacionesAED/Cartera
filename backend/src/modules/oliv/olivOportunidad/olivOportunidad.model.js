// Deal de HubSpot, filtrado a `proyecto_inmobiliario_cac = 'Oliv'` -- el
// mismo HubSpot es compartido entre varios proyectos inmobiliarios de AED
// (ej. Almar), ver el comentario en olivOportunidad.sync.js. `propiedades`
// guarda el objeto `properties` crudo completo que devuelve HubSpot (mismo
// criterio que "JSON para datos variables" del resto de Cartera, ver
// CLAUDE.md) -- el resto de columnas reales se agregan a medida que se
// definan más reglas de negocio. `nombre_contacto`/`proyecto`/`stage`
// (ya resuelto a etiqueta, no el ID interno del pipeline) calcados 1:1 de
// cómo los usa Centro-aplicaciones-comerciales-AED (mismo HubSpot,
// DealSelectionTable.tsx/server/index.js) -- pedido explícito del usuario.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const OlivInmueble = require('../olivInmueble/olivInmueble.model');

const OlivOportunidad = sequelize.define(
  'OlivOportunidad',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    hubspot_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    deal_name: { type: DataTypes.STRING(255), allowNull: false },
    nombre_contacto: { type: DataTypes.STRING(255), allowNull: true },
    // `correo`/`numero_de_telefono_movil` en HubSpot -- mismo criterio que
    // contact_email/contact_phone en Oportunidad (Baía Kristal/Zoho).
    email: { type: DataTypes.STRING(255), allowNull: true },
    telefono: { type: DataTypes.STRING(50), allowNull: true },
    proyecto: { type: DataTypes.STRING(100), allowNull: true },
    stage: { type: DataTypes.STRING(150), allowNull: true },
    // Posición 0-indexada de la etapa dentro de su pipeline de HubSpot (-1
    // para la etapa de "perdido") -- usado por list() para filtrar "etapa 8
    // y superiores" (ETAPA_MINIMA_ORDER, ver utils/olivHelpers.js), ver olivOportunidad.service.js.
    stage_order: { type: DataTypes.INTEGER, allowNull: true },
    // `referencia_de_recaudo` en HubSpot -- solo la tienen algunos negocios
    // (los que ya llegaron a separación/escrituración), igual que
    // referencia_recaudo en Oportunidad (Baía Kristal/Zoho).
    referencia_recaudo: { type: DataTypes.STRING(100), allowNull: true },
    // Id de HubSpot de la Unidad asociada (objeto "Unidades", 2-51798334) --
    // guardado en sync via la Associations API nativa, ver olivOportunidad.sync.js.
    // Usado por olivNegocio.service.js para cruzar Inmueble<->Oportunidad
    // localmente sin llamadas en vivo a HubSpot.
    inmueble_hubspot_id: { type: DataTypes.STRING(50), allowNull: true },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    close_date: { type: DataTypes.DATE, allowNull: true },
    propiedades: { type: DataTypes.JSONB, allowNull: true },
    ultimo_sync_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'oliv_oportunidades',
    underscored: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [{ fields: ['stage'] }],
  }
);

// Jefe Gabriel, 2026-09-25: "la columna de inmueble como está en Baía
// Kristal que conecta la referencia con el inmueble". A diferencia de Baía
// Kristal (donde el cruce es indirecto, por texto de `referencia_recaudo`
// contra `inventario_items` -- ver `inventarioTorres.service.js`), acá HAY
// una FK real: `inmueble_hubspot_id` apunta a `OlivInmueble.hubspot_id`
// (`unique: true`, no la PK -- `targetKey` en vez de la asociación por PK
// default). Poder usar un `include`/`order` real de Sequelize en vez de una
// subquery correlacionada a mano.
OlivOportunidad.belongsTo(OlivInmueble, { foreignKey: 'inmueble_hubspot_id', targetKey: 'hubspot_id', as: 'inmueble' });

module.exports = OlivOportunidad;
