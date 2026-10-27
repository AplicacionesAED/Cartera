// Una pestaña del Excel subido, tal cual (columnas + filas crudas) --
// equivalente a HojaFiduciaria de Baía Kristal.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const OlivEncargo = require('./olivEncargo.model');

const OlivHoja = sequelize.define(
  'OlivHoja',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    encargo_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: OlivEncargo, key: 'id' } },
    nombre_hoja: { type: DataTypes.STRING(255), allowNull: false },
    columnas: { type: DataTypes.JSONB, allowNull: false },
    filas: { type: DataTypes.JSONB, allowNull: false },
    total_filas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: 'oliv_hojas', underscored: true, createdAt: 'creado_en', updatedAt: false, indexes: [{ fields: ['encargo_id'] }] }
);

OlivHoja.belongsTo(OlivEncargo, { as: 'encargo', foreignKey: 'encargo_id', onDelete: 'CASCADE' });
OlivEncargo.hasMany(OlivHoja, { as: 'hojas', foreignKey: 'encargo_id' });

module.exports = OlivHoja;
