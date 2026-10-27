// Mismo modelo que ZohoFieldMetadata en el schema.prisma legado -- metadatos
// de campos del módulo Deals de Zoho, usados por oportunidad.sync.js para
// mapear dinámicamente qué campos traer (currency, "Pago Separación",
// "Referencia de Recaudo", etc.) sin hardcodear nombres de API.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const ZohoFieldMetadata = sequelize.define(
  'ZohoFieldMetadata',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    api_name: { type: DataTypes.STRING(200), allowNull: false, unique: true },
    field_label: { type: DataTypes.STRING(255), allowNull: false },
    data_type: { type: DataTypes.STRING(50), allowNull: false },
    section_name: { type: DataTypes.STRING(200), allowNull: true },
    es_personalizado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: 'zoho_field_metadata', underscored: true, createdAt: 'creado_en', updatedAt: false }
);

module.exports = ZohoFieldMetadata;
