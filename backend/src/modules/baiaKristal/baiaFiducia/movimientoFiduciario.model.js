// Mismo modelo que MovimientoFiduciario en el schema.prisma legado -- cada
// fila de una hoja. NORMALIZADO (ver backend/scripts/migracion/normalizacion/DISENO.md): las líneas de
// movimiento ("forma A", 96 %) viven en columnas reales (tipo_movimiento, fecha_contable, valor, ...) que
// llena el disparador mf_llenar_columnas() a partir de `datos`; las de estado por unidad ("forma B") y
// cualquier forma desconocida se quedan solo en `datos` (jsonb). Para LEER el objeto `datos` original usa
// siempre `mf_datos(fila)` (SQL) en vez de la columna cruda: lo reconstruye idéntico desde las columnas.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');
const EncargFiduciario = require('./encargFiduciario.model');
const HojaFiduciaria = require('./hojaFiduciaria.model');

const MovimientoFiduciario = sequelize.define(
  'MovimientoFiduciario',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    encarg_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: EncargFiduciario, key: 'id' } },
    hoja_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: HojaFiduciaria, key: 'id' } },
    nombre_hoja: { type: DataTypes.STRING(255), allowNull: false },
    propietario: { type: DataTypes.TEXT, allowNull: true },
    datos: { type: DataTypes.JSONB, allowNull: false },
    // Columnas normalizadas (las llena el disparador; no se escriben a mano).
    forma: { type: DataTypes.CHAR(1), allowNull: true },
    tipo_movimiento: { type: DataTypes.TEXT, allowNull: true },
    fecha_contable: { type: DataTypes.DATEONLY, allowNull: true },
    fecha_mov_banco: { type: DataTypes.DATEONLY, allowNull: true },
    valor: { type: DataTypes.DECIMAL, allowNull: true },
    concepto: { type: DataTypes.INTEGER, allowNull: true },
    id_interno: { type: DataTypes.INTEGER, allowNull: true },
    estado: { type: DataTypes.TEXT, allowNull: true },
    propietario_1: { type: DataTypes.TEXT, allowNull: true },
    nro_id_propietario_1: { type: DataTypes.TEXT, allowNull: true },
    pct_participacion_1: { type: DataTypes.TEXT, allowNull: true },
    cuenta_bancaria: { type: DataTypes.TEXT, allowNull: true },
    sucursal: { type: DataTypes.TEXT, allowNull: true },
    comentarios: { type: DataTypes.TEXT, allowNull: true },
    razones_justificaciones: { type: DataTypes.TEXT, allowNull: true },
    observaciones: { type: DataTypes.TEXT, allowNull: true },
    inventario: { type: DataTypes.TEXT, allowNull: true },
    nomenclatura: { type: DataTypes.TEXT, allowNull: true },
    referencia: { type: DataTypes.TEXT, allowNull: true },
    fideicomiso: { type: DataTypes.TEXT, allowNull: true },
    area: { type: DataTypes.DECIMAL, allowNull: true },
    categoria: { type: DataTypes.TEXT, allowNull: true },
    tipo_inmueble: { type: DataTypes.TEXT, allowNull: true },
    datos_extra: { type: DataTypes.JSONB, allowNull: true },
    legacy_id: { type: DataTypes.UUID, allowNull: true, unique: true },
  },
  {
    tableName: 'movimientos_fiduciarios',
    underscored: true,
    createdAt: 'creado_en',
    updatedAt: false,
    indexes: [{ fields: ['encarg_id'] }, { fields: ['propietario'] }, { fields: ['encarg_id', 'propietario'] }],
  }
);

MovimientoFiduciario.belongsTo(EncargFiduciario, { as: 'encargo', foreignKey: 'encarg_id', onDelete: 'CASCADE' });
MovimientoFiduciario.belongsTo(HojaFiduciaria, { as: 'hoja', foreignKey: 'hoja_id', onDelete: 'CASCADE' });

module.exports = MovimientoFiduciario;
