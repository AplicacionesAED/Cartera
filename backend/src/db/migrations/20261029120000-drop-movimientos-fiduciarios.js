// Elimina `movimientos_fiduciarios` (y su disparador/funciones). Era una copia fila por fila de las hojas del Excel
// de la fiducia (`hojas_fiduciarias.filas`): ninguna pantalla, workflow de n8n ni la reconstrucción de Negocios la leían
// (Negocios lee las hojas), y pesaba ~2,3 GB. Los datos siguen completos en `hojas_fiduciarias`.
// Idempotente. No hay `down` real: la tabla se puede regenerar desde las hojas, pero nada la necesita.
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('DROP TRIGGER IF EXISTS mf_llenar_columnas_tg ON movimientos_fiduciarios');
    await q('DROP FUNCTION IF EXISTS mf_datos(movimientos_fiduciarios)');
    await q('DROP FUNCTION IF EXISTS mf_llenar_columnas()');
    await q('DROP TABLE IF EXISTS movimientos_fiduciarios');
  },

  async down() {},
};
