// Equivalente a ZohoFieldMetadata (oportunidad/zohoFieldMetadata.model.js)
// pero para las propiedades del objeto Deals de HubSpot -- usado por
// olivOportunidad.sync.js para saber qué propiedades pedir sin hardcodear
// nombres, y por el frontend para traducir claves crudas a etiquetas.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const OlivPropiedadMetadata = sequelize.define(
  'OlivPropiedadMetadata',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(200), allowNull: false, unique: true },
    label: { type: DataTypes.STRING(255), allowNull: false },
    tipo: { type: DataTypes.STRING(50), allowNull: false },
    grupo: { type: DataTypes.STRING(200), allowNull: true },
    es_personalizado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: 'oliv_propiedad_metadata', underscored: true, createdAt: 'creado_en', updatedAt: false }
);

module.exports = OlivPropiedadMetadata;
