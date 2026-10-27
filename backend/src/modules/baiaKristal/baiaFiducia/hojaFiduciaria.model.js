// Mismo modelo que HojaFiduciaria en el schema.prisma legado -- una pestaña
// del Excel subido, tal cual (columnas + filas crudas).
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const EncargFiduciario = require('./encargFiduciario.model');

const HojaFiduciaria = sequelize.define(
  'HojaFiduciaria',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    encarg_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: EncargFiduciario, key: 'id' } },
    nombre_hoja: { type: DataTypes.STRING(255), allowNull: false },
    columnas: { type: DataTypes.JSONB, allowNull: false },
    filas: { type: DataTypes.JSONB, allowNull: false },
    total_filas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    legacy_id: { type: DataTypes.UUID, allowNull: true, unique: true },
  },
  { tableName: 'hojas_fiduciarias', underscored: true, createdAt: 'creado_en', updatedAt: false, indexes: [{ fields: ['encarg_id'] }] }
);

HojaFiduciaria.belongsTo(EncargFiduciario, { as: 'encargo', foreignKey: 'encarg_id', onDelete: 'CASCADE' });
EncargFiduciario.hasMany(HojaFiduciaria, { as: 'hojas', foreignKey: 'encarg_id' });

module.exports = HojaFiduciaria;
