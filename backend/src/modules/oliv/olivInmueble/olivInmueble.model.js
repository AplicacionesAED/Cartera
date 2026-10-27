// Unidad del objeto personalizado "Unidades" de HubSpot (id '2-51798334'),
// filtrada a `proyecto_inmobiliario = 'Oliv'` -- mismo objeto que usa
// Centro-Aplicaciones-Comerciales-AED (Cotizador de Cuotas) para sus
// unidades disponibles, ver server/index.js#fetchProjectUnits ahí. Columnas
// promovidas 1:1 de las propiedades que esa app ya usa en producción (no
// hace falta adivinar cuáles importan, como sí tocó con Oportunidades) --
// `propiedades` igual guarda el objeto `properties` crudo completo por si
// hace falta algo más adelante.
const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const OlivInmueble = sequelize.define(
  'OlivInmueble',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    hubspot_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    codigo_unidad: { type: DataTypes.STRING(100), allowNull: true },
    id_unidad: { type: DataTypes.STRING(100), allowNull: true },
    proyecto: { type: DataTypes.STRING(100), allowNull: true },
    torre: { type: DataTypes.STRING(100), allowNull: true },
    piso: { type: DataTypes.INTEGER, allowNull: true },
    categoria: { type: DataTypes.STRING(150), allowNull: true },
    tipo_apartamento: { type: DataTypes.STRING(150), allowNull: true },
    estado: { type: DataTypes.STRING(100), allowNull: true },
    valor_comercial: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    valor_m2: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    area_construida: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    area_privada: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    area_terraza: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    alcobas: { type: DataTypes.STRING(50), allowNull: true },
    banos: { type: DataTypes.DECIMAL(4, 1), allowNull: true },
    bono: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    tipo_vista: { type: DataTypes.STRING(150), allowNull: true },
    plano_link: { type: DataTypes.TEXT, allowNull: true },
    propiedades: { type: DataTypes.JSONB, allowNull: true },
    ultimo_sync_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'oliv_inmuebles',
    underscored: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [{ fields: ['torre'] }, { fields: ['categoria'] }, { fields: ['estado'] }],
  }
);

module.exports = OlivInmueble;
