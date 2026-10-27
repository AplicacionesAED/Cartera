// Equivalente a SyncLog (oportunidad/syncLog.model.js) pero para las
// sincronizaciones con HubSpot -- historial separado del de Zoho a
// propósito (dos CRM, dos proyectos, sin cruzar tablas).
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const OlivSyncLog = sequelize.define(
  'OlivSyncLog',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    iniciado_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finalizado_en: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false },
    registros_sync: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    error_msg: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: 'oliv_sync_logs', underscored: true, timestamps: false }
);

module.exports = OlivSyncLog;
