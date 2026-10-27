const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const Negocio = require('./baiaNegocio.model');

const NegocioComprador = sequelize.define(
  'NegocioComprador',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    negocio_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Negocio, key: 'id' } },
    nombre: { type: DataTypes.STRING(255), allowNull: false },
    nro_id: { type: DataTypes.STRING(50), allowNull: true },
    porcentaje: { type: DataTypes.FLOAT, allowNull: true },
    orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    legacy_id: { type: DataTypes.UUID, allowNull: true, unique: true },
  },
  { tableName: 'negocio_compradores', underscored: true, timestamps: false, indexes: [{ fields: ['negocio_id'] }, { fields: ['nombre'] }] }
);

NegocioComprador.belongsTo(Negocio, { as: 'negocio', foreignKey: 'negocio_id', onDelete: 'CASCADE' });
Negocio.hasMany(NegocioComprador, { as: 'compradores', foreignKey: 'negocio_id' });

module.exports = NegocioComprador;
