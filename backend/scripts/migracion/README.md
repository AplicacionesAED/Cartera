# Migración a una base de datos nueva

Pasa los datos de Cartera a una base PostgreSQL nueva (`DESTINO_DATABASE_URL` en `backend/.env`, que está ignorado por git).

> Los scripts de importación desde la base legada (`importarDatosLegado.js`, `pasadaFinalMovimientos.js` y los pasos de
> normalización de `movimientos_fiduciarios`) se eliminaron el 2026-10-29: la tabla ya no existe y Negocios se reconstruye a
> diario desde `hojas_fiduciarias`. Siguen en el historial de git. `copiarDesdeV2.js` **no** copia encargos, hojas ni negocios de
> Baía Kristal.

## Qué copia `copiarDesdeV2.js`

| Datos | Fuente |
|---|---|
| **Todo Oliv** (`oliv_*`) | Base `cartera_aed_v2` (`PG*`) |
| **Solo existe en la v2**: usuarios, roles, auditoría, inventario, oportunidades y otrosíes de Baía Kristal, logs de sincronización, metadatos de Zoho | Base `cartera_aed_v2` |

La base de origen se lee **solo en lectura** (el script fuerza `default_transaction_read_only`). Solo se escribe en el destino.

## Pasos

```bash
# 1. esquema: aplica TODAS las migraciones sobre la base vacía (PG* apuntando al destino)
NODE_ENV=production npx sequelize-cli db:migrate

# 2. Oliv y tablas solo-v2 (usa PG* original como ORIGEN: ejecútalo en una terminal SIN las variables del paso 1)
node scripts/migracion/copiarDesdeV2.js

# pasada final (el día del cambio): actualiza las filas existentes
node scripts/migracion/copiarDesdeV2.js --actualizar
node scripts/migracion/copiarDesdeV2.js --verificar          # compara conteos, no escribe
```

Después del corte: apunta las variables del despliegue a la base nueva y **reinicia** el servidor (el cálculo de cartera vive en memoria).
