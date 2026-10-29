// Mismo modelo que Negocio en el schema.prisma legado -- expediente
// financiero por comprador, poblado desde el Excel de fiducia (ver
// negocio.backfill.js). `en_tramite`/`es_canje` son marcas manuales desde
// Cartera en Gestión (fase de Dashboard, todavía no migrada) -- se
// incluyen acá porque son columnas del modelo, no lógica de esa pantalla.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const Negocio = sequelize.define(
  'Negocio',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    referencia: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    estado: { type: DataTypes.STRING(255), allowNull: true },
    datos: { type: DataTypes.JSONB, allowNull: true },
    saldo_actual: { type: DataTypes.FLOAT, allowNull: true },
    en_tramite: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    es_canje: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // La fiducia dejó de reportar la referencia (no viene en el Excel más reciente de su fideicomiso); lo fija el backfill.
    desvinculado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: 'negocios',
    underscored: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [{ fields: ['estado'] }, { fields: ['saldo_actual'] }],
  }
);

module.exports = Negocio;
