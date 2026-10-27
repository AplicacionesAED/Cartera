// Mismo modelo que ResumenCarteraMensual en el schema.prisma legado -- foto
// fija mensual del "Consolidado de Cartera por Etapa" (Resumen Gerencial).
// El cálculo en vivo es siempre el estado ACTUAL del portafolio -- no hay
// forma de reconstruir con certeza cómo se veía en un mes ya cerrado, así
// que se guarda una foto al cierre de cada mes (ver dashboard.service.js,
// cerrarMesAnteriorSiFalta -- todavía sin cron, ver hoja de ruta) para poder
// navegar "mes a mes" igual que las hojas del Excel de Gerencia.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const ResumenCarteraMensual = sequelize.define(
  'ResumenCarteraMensual',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    mes: { type: DataTypes.STRING(7), allowNull: false, unique: true }, // "YYYY-MM"
    datos: { type: DataTypes.JSONB, allowNull: false },
  },
  { tableName: 'resumen_cartera_mensual', underscored: true, createdAt: 'creado_en', updatedAt: false }
);

module.exports = ResumenCarteraMensual;
