// Un Excel de movimientos de Oliv subido -- equivalente a EncargFiduciario
// de Baía Kristal (módulo fiducia/), pero sin `email_id`/`email_asunto`/
// `email_fecha` (esos existen ahí solo por la ingesta automática por correo
// de Baía Kristal, que Oliv no tiene -- acá la subida siempre es manual).
// `codigo` queda disponible para diferenciar lotes de carga (ej. "Ene 2027")
// aunque Oliv sea un solo proyecto, sin fideicomisos distintos como Baía
// Kristal.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const OlivEncargo = sequelize.define(
  'OlivEncargo',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    nombre: { type: DataTypes.STRING(255), allowNull: false },
    codigo: { type: DataTypes.STRING(50), allowNull: true },
    archivo_nombre: { type: DataTypes.STRING(255), allowNull: false },
    // Fecha del Excel en sí (Jefe Gabriel, 2026-09-24) -- UNA por Encargo,
    // todos sus movimientos la comparten (el Excel no trae fecha por fila,
    // ver olivEncargo.upload.js#procesarArchivoOliv). Siempre se le pide al
    // usuario al subir; si no la manda, el upload la completa con hoy --
    // nunca queda null en una fila nueva. Las filas viejas (previas a esta
    // columna) quedaron con la fecha de subida real vía backfill
    // (migración 20260924160000).
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
  },
  { tableName: 'oliv_encargos', underscored: true, createdAt: 'creado_en', updatedAt: false, indexes: [{ fields: ['codigo'] }, { fields: ['fecha'] }] }
);

module.exports = OlivEncargo;
