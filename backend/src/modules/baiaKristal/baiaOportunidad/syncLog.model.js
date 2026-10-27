// Mismo modelo que SyncLog en el schema.prisma legado -- historial de
// sincronizaciones con Zoho (status: 'running' | 'success' | 'error').
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const SyncLog = sequelize.define(
  'SyncLog',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    iniciado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finalizado_en: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false },
    registros_sync: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    error_msg: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'sync_logs', underscored: true, timestamps: false }
);

module.exports = SyncLog;
