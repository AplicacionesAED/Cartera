// Modelo de la tabla PROPIA del módulo de SOLO LECTURA 'Otrosíes' (Baía
// Kristal). Creada por Osca (20260923190000-create-otrosi.js): NO vive en
// `oportunidades` porque Otrosíes muestra TODOS los Deals de Baía Kristal
// (6663) con archivo en 'Otro sí - Contrato Fiducia', y `oportunidades` solo
// sincroniza los que tienen `pago_separacion` (1931).
//
// `zoho_deal_id` es la clave natural (upsert del sync con ON CONFLICT).
// `otro_si_tiene_archivo` se puebla SOLO por backfill de GET individual
// (el bulk de Zoho da falsos negativos en el fileupload -- ver
// hive/reports/baia-kristal-otrosi-contrato-fiducia.md); null = sin verificar.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const Usuario = require('../../usuario/usuario.model');

const Otrosi = sequelize.define(
  'Otrosi',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    zoho_deal_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    deal_name: { type: DataTypes.STRING(255), allowNull: true },
    etapa: { type: DataTypes.STRING(100), allowNull: true },
    stage: { type: DataTypes.STRING(255), allowNull: true },
    referencia_recaudo: { type: DataTypes.STRING(100), allowNull: true },
    otro_si_requerido: { type: DataTypes.STRING(20), allowNull: true },
    encargado_otro_si: { type: DataTypes.STRING(100), allowNull: true },
    otro_si_tiene_archivo: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: null },
    otro_si_archivo_verificado_en: { type: DataTypes.DATE, allowNull: true },
    sincronizado_en: { type: DataTypes.DATE, allowNull: true },
    // Check MANUAL (no del sync -- ver el comentario largo en
    // 20260924110000-otrosi-add-verificacion.js): un encargado lo marca a
    // mano desde el frontend cuando ya comparó el documento del otrosí
    // contra el plan de pagos del CRM. `otrosi.sync.js#upsertOtrosi` NUNCA
    // incluye estas 3 columnas en su `ON CONFLICT DO UPDATE SET` -- un
    // re-sync no las toca.
    verificado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    verificado_por_id: { type: DataTypes.INTEGER, allowNull: true },
    verificado_en: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'baia_kristal_otrosies',
    underscored: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [{ fields: ['etapa'] }, { fields: ['stage'] }, { fields: ['referencia_recaudo'] }, { fields: ['verificado'] }],
  }
);

Otrosi.belongsTo(Usuario, { as: 'verificadoPor', foreignKey: 'verificado_por_id' });

module.exports = Otrosi;