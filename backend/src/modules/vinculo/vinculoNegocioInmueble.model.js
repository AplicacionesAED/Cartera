// Vínculo ya resuelto Negocio <-> Inmueble (ver la migración 20261020120000 y vinculoResolver.js).
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const VinculoNegocioInmueble = sequelize.define(
  'VinculoNegocioInmueble',
  {
    referencia: { type: DataTypes.STRING(100), primaryKey: true },
    inventario_id: { type: DataTypes.INTEGER, allowNull: true },
    estado: { type: DataTypes.STRING(20), allowNull: false },
    metodo: { type: DataTypes.STRING(80), allowNull: true },
    negocio_estado: { type: DataTypes.STRING(40), allowNull: true },
    requiere_revision: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    detalle: { type: DataTypes.TEXT, allowNull: true },
    observaciones: { type: DataTypes.JSONB, allowNull: true },
    senales: { type: DataTypes.JSONB, allowNull: true },
    actualizado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: 'vinculos_negocio_inmueble', timestamps: false }
);

module.exports = VinculoNegocioInmueble;
