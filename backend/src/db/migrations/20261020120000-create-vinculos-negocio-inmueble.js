'use strict';

// Vínculo Negocio (fiducia) <-> Inmueble (Zoho) ya RESUELTO, una fila por negocio. Lo calcula
// modules/vinculo/vinculoResolver.js con tres señales (referencia del inmueble, inmueble de la oportunidad y
// nomenclatura de la fiducia) y lo leen Negocios, Vinculados, Resumen, Dashboard y Cartera, para que todos
// usen la misma decisión.
//
// Se identifica por `referencia` (no por negocio_id): la tabla `negocios` se vacía y se reconstruye con cada
// carga de fiducia (ids nuevos), la referencia es la clave estable del negocio.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('vinculos_negocio_inmueble', {
      referencia: { type: Sequelize.STRING(100), primaryKey: true, allowNull: false },
      inventario_id: { type: Sequelize.INTEGER, allowNull: true },
      // CONFIRMADO | CORREGIDO | UNA_SENAL | CONFLICTO | AMBIGUO | SIN_VINCULO
      estado: { type: Sequelize.STRING(20), allowNull: false },
      metodo: { type: Sequelize.STRING(80), allowNull: true },
      negocio_estado: { type: Sequelize.STRING(40), allowNull: true },
      requiere_revision: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      detalle: { type: Sequelize.TEXT, allowNull: true },
      observaciones: { type: Sequelize.JSONB, allowNull: true },
      senales: { type: Sequelize.JSONB, allowNull: true },
      actualizado_en: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('vinculos_negocio_inmueble', ['inventario_id']);
    await queryInterface.addIndex('vinculos_negocio_inmueble', ['estado']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('vinculos_negocio_inmueble');
  },
};
