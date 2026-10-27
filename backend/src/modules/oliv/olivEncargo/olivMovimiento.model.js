// Cada fila de una hoja, normalizada como { columna: valor } en `datos`,
// con `propietario` extraído (heurística por nombre de columna, ver
// olivEncargo.upload.js) para poder filtrar/agrupar sin tener que consultar
// el JSON en cada query -- equivalente a MovimientoFiduciario de Baía
// Kristal.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const OlivEncargo = require('./olivEncargo.model');
const OlivHoja = require('./olivHoja.model');

const OlivMovimiento = sequelize.define(
  'OlivMovimiento',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    encargo_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: OlivEncargo, key: 'id' } },
    hoja_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: OlivHoja, key: 'id' } },
    nombre_hoja: { type: DataTypes.STRING(255), allowNull: false },
    propietario: { type: DataTypes.STRING(255), allowNull: true },
    datos: { type: DataTypes.JSONB, allowNull: false },
  },
  {
    tableName: 'oliv_movimientos',
    underscored: true,
    createdAt: 'creado_en',
    updatedAt: false,
    indexes: [{ fields: ['encargo_id'] }, { fields: ['propietario'] }, { fields: ['encargo_id', 'propietario'] }],
  }
);

OlivMovimiento.belongsTo(OlivEncargo, { as: 'encargo', foreignKey: 'encargo_id', onDelete: 'CASCADE' });
OlivMovimiento.belongsTo(OlivHoja, { as: 'hoja', foreignKey: 'hoja_id', onDelete: 'CASCADE' });

module.exports = OlivMovimiento;
