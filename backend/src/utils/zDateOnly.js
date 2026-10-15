// Va en backend/src/utils/zDateOnly.js. SIEMPRE para validar una columna que es
// conceptualmente "solo fecha" (DataTypes.DATEONLY en el modelo). Nunca
// z.coerce.date(): un Date de JS se serializa en la zona horaria local del
// proceso y corre el dia calendario hacia atras. Ver "Fechas" en
// ARQUITECTURA-BACKEND.md.
const { z } = require('zod');

function zDateOnly() {
  return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida (YYYY-MM-DD)');
}

module.exports = { zDateOnly };
