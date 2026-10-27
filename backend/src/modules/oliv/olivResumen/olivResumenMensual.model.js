// Foto fija mensual del "Consolidado de Cartera por Torre" de Oliv --
// equivalente a `dashboard/resumenCarteraMensual.model.js` de Baía Kristal.
// Ver migración 20260925120000-create-oliv-resumen-mensual.js.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const OlivResumenMensual = sequelize.define(
  'OlivResumenMensual',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    mes: { type: DataTypes.STRING(7), allowNull: false, unique: true }, // "YYYY-MM"
    datos: { type: DataTypes.JSONB, allowNull: false },
  },
  { tableName: 'oliv_resumen_mensual', underscored: true, createdAt: 'creado_en', updatedAt: false }
);

module.exports = OlivResumenMensual;
