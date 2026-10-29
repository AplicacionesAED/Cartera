// `negocios.desvinculado`: true cuando la referencia ya no viene en el Excel más reciente de su fideicomiso (la fiducia
// dejó de reportarla). Lo calcula la reconstrucción de Negocios (baiaNegocio.backfill.js) y el resolver de vínculos
// descarta esos negocios al decidir el estado fiducia de cada inmueble. Idempotente.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE negocios ADD COLUMN IF NOT EXISTS desvinculado BOOLEAN NOT NULL DEFAULT false');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE negocios DROP COLUMN IF EXISTS desvinculado');
  },
};
