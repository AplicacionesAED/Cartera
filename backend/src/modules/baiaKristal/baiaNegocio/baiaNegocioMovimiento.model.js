const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const Negocio = require('./baiaNegocio.model');

const NegocioMovimiento = sequelize.define(
  'NegocioMovimiento',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    negocio_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Negocio, key: 'id' } },
    referencia: { type: DataTypes.STRING(100), allowNull: false },
    id_movimiento: { type: DataTypes.STRING(100), allowNull: true, unique: true },
    fecha_contable: { type: DataTypes.DATE, allowNull: true },
    datos: { type: DataTypes.JSONB, allowNull: false },
    legacy_id: { type: DataTypes.UUID, allowNull: true, unique: true },
  },
  {
    tableName: 'negocio_movimientos',
    underscored: true,
    createdAt: 'creado_en',
    updatedAt: false,
    indexes: [{ fields: ['negocio_id'] }, { fields: ['referencia'] }, { fields: ['fecha_contable'] }],
  }
);

NegocioMovimiento.belongsTo(Negocio, { as: 'negocio', foreignKey: 'negocio_id', onDelete: 'CASCADE' });
Negocio.hasMany(NegocioMovimiento, { as: 'movimientos', foreignKey: 'negocio_id' });

module.exports = NegocioMovimiento;
