// Primer módulo de negocio migrado desde zoho-payment-tracker/ (piloto de la
// migración -- ver el plan). Mismo modelo que `ConfiguracionFrente` en
// prisma/schema.prisma del proyecto legado, reimplementado en Sequelize.
//
// Fecha de entrega real por Frente + Torre + Piso -- se puede configurar a
// tres niveles, mutuamente excluyentes entre sí: todo el proyecto, una torre
// completa, o un piso específico de una torre (ver `CLAVE_TODAS` en
// configuracionFrente.service.js).
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const ConfiguracionFrente = sequelize.define(
  'ConfiguracionFrente',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    frente: { type: DataTypes.STRING(200), allowNull: false },
    torre: { type: DataTypes.STRING(200), allowNull: false },
    piso: { type: DataTypes.STRING(200), allowNull: false },
    fecha_entrega: { type: DataTypes.DATEONLY, allowNull: true },
  },
  {
    tableName: 'configuraciones_frente',
    underscored: true,
    createdAt: false,
    updatedAt: 'actualizado_en',
    indexes: [{ unique: true, fields: ['frente', 'torre', 'piso'] }],
  }
);

module.exports = ConfiguracionFrente;
