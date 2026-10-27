// Mismo modelo que EncargFiduciario en el schema.prisma legado -- un Excel
// de fiducia subido (encargo fiduciario / fideicomiso).
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const EncargFiduciario = sequelize.define(
  'EncargFiduciario',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    nombre: { type: DataTypes.STRING(255), allowNull: false },
    codigo: { type: DataTypes.STRING(50), allowNull: true },
    archivo_nombre: { type: DataTypes.STRING(255), allowNull: false },
    email_id: { type: DataTypes.STRING(255), allowNull: true },
    email_asunto: { type: DataTypes.STRING(500), allowNull: true },
    email_fecha: { type: DataTypes.DATE, allowNull: true },
    // Solo control interno de scripts/importarDatosLegado.js -- nunca se
    // expone via API ni se usa en relaciones de la app.
    legacy_id: { type: DataTypes.UUID, allowNull: true, unique: true },
  },
  { tableName: 'encargos_fiduciarios', underscored: true, createdAt: 'creado_en', updatedAt: false, indexes: [{ fields: ['codigo'] }] }
);

module.exports = EncargFiduciario;
