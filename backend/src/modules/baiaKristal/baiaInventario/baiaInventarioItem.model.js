// Mismo modelo que InventarioItem en prisma/schema.prisma del proyecto
// legado (Producto de Zoho CRM -- inmueble físico), reimplementado en
// Sequelize. `datos` guarda TODOS los campos del Product tal cual vienen de
// Zoho (sin metadatos internos `$`, filtrados en el sync) -- las columnas
// propias (proyecto/torre/piso/categoria/estado/referencia_recaudo) son un
// subconjunto extraído para poder indexar/filtrar sin tener que consultar
// el JSON en cada query.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const InventarioItem = sequelize.define(
  'InventarioItem',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    zoho_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    nombre: { type: DataTypes.STRING(255), allowNull: true },
    proyecto: { type: DataTypes.STRING(255), allowNull: true },
    torre: { type: DataTypes.STRING(100), allowNull: true },
    piso: { type: DataTypes.STRING(100), allowNull: true },
    categoria: { type: DataTypes.STRING(100), allowNull: true },
    estado: { type: DataTypes.STRING(100), allowNull: true },
    referencia_recaudo: { type: DataTypes.STRING(100), allowNull: true },
    datos: { type: DataTypes.JSONB, allowNull: true },
    ultimo_sync_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'inventario_items',
    underscored: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [
      { fields: ['proyecto'] },
      { fields: ['categoria'] },
      { fields: ['estado'] },
      { fields: ['referencia_recaudo'] },
    ],
  }
);

module.exports = InventarioItem;
