const { z } = require('zod');
const { zDateOnly } = require('../../../utils/zDateOnly');

// fechaEntrega: null limpia la configuracion de ese nivel (equivale a "sin
// fecha configurada"), un string YYYY-MM-DD la fija.
const fechaEntregaSchema = z.object({
  fechaEntrega: zDateOnly().nullable(),
});

module.exports = { fechaEntregaSchema };
