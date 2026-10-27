// Mismo modelo que Opportunity en el schema.prisma legado (Deal de Zoho
// CRM), reimplementado en Sequelize.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const Oportunidad = sequelize.define(
  'Oportunidad',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    zoho_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    deal_name: { type: DataTypes.STRING(255), allowNull: false },
    stage: { type: DataTypes.STRING(100), allowNull: true },
    contact_name: { type: DataTypes.STRING(255), allowNull: true },
    contact_email: { type: DataTypes.STRING(255), allowNull: true },
    contact_phone: { type: DataTypes.STRING(50), allowNull: true },
    contact_id: { type: DataTypes.STRING(50), allowNull: true },
    account_name: { type: DataTypes.STRING(255), allowNull: true },
    referencia_recaudo: { type: DataTypes.STRING(100), allowNull: true },
    pago_separacion: { type: DataTypes.DATE, allowNull: true },
    fecha_inicio_plan_pagos: { type: DataTypes.DATE, allowNull: true },
    campos_financieros: { type: DataTypes.JSONB, allowNull: true },
    seccion_inmueble: { type: DataTypes.JSONB, allowNull: true },
    seccion_cotizacion: { type: DataTypes.JSONB, allowNull: true },
    forma_pago: { type: DataTypes.JSONB, allowNull: true },
    propuesta_pago: { type: DataTypes.JSONB, allowNull: true },
    ultimo_sync_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'oportunidades',
    underscored: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [{ fields: ['referencia_recaudo'] }, { fields: ['stage'] }, { fields: ['pago_separacion'] }],
  }
);

module.exports = Oportunidad;
