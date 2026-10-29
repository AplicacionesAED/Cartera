// Copia las tablas que NO vienen de la base legada (Prisma) desde la base actual
// `cartera_aed_v2` (PG* del .env, SOLO LECTURA) hacia la base NUEVA de destino
// (DESTINO_DATABASE_URL del .env). Ver README.md de esta carpeta.
//
//   - Todo Oliv (la v2 es su fuente confiable): oliv_*.
//   - Lo que solo existe en la v2: usuarios/roles/auditoria, inventario, otrosíes,
//     configuraciones de frente, oportunidades de Baía Kristal, logs de sync.
//   - Baía Kristal "con movimientos" (negocios, compradores, movimientos, encargos,
//     hojas, resumen) NO va aquí (antes venía de la base legada con
//     scripts/importarDatosLegado.js, que ya se eliminó).
//
// Uso:  node scripts/migracion/copiarDesdeV2.js              (primera copia: no pisa filas existentes)
//       node scripts/migracion/copiarDesdeV2.js --actualizar (pasada final: actualiza las filas existentes)
//       node scripts/migracion/copiarDesdeV2.js --verificar  (solo compara conteos, no escribe)
//
// Los `id` se conservan tal cual (estas tablas se relacionan entre sí por id) y las
// secuencias del destino se reajustan al final. La carga va por json_populate_recordset:
// Postgres convierte cada valor al tipo real de la columna (jsonb, arrays, fechas...).
require('dotenv').config();
const { Client } = require('pg');

// Orden respetando las llaves foráneas (padres antes que hijos).
const TABLAS = [
  'roles',
  'usuarios',
  'auditoria_usuarios',
  'inventario_items',
  'oportunidades',
  'baia_kristal_otrosies',
  'configuraciones_frente',
  'sync_logs',
  'zoho_field_metadata',
  'oliv_oportunidades',
  'oliv_inmuebles',
  'oliv_propiedad_metadata',
  'oliv_encargos',
  'oliv_hojas',
  'oliv_movimientos',
  'oliv_sync_logs',
  'oliv_resumen_mensual',
];
const LOTE = 1000;
const ACTUALIZAR = process.argv.includes('--actualizar');
const SOLO_VERIFICAR = process.argv.includes('--verificar');

const ORIGEN = { host: process.env.PGHOST, port: Number(process.env.PGPORT ?? 5432), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE };
const DESTINO_URL = process.env.DESTINO_DATABASE_URL;
if (!DESTINO_URL) {
  console.error('Falta DESTINO_DATABASE_URL en backend/.env');
  process.exit(1);
}
if (DESTINO_URL.includes(`${ORIGEN.host}:${ORIGEN.port}/${ORIGEN.database}`)) {
  console.error('El destino es la misma base que el origen -- abortado.');
  process.exit(1);
}

async function contar(c, tabla) {
  return Number((await c.query(`SELECT COUNT(*)::bigint AS n FROM "${tabla}"`)).rows[0].n);
}

async function copiar(origen, destino, tabla) {
  const cols = (await destino.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [tabla]
  )).rows.map((r) => r.column_name);
  if (!cols.includes('id')) throw new Error(`${tabla}: no tiene columna id`);
  const sets = cols.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  const conflicto = ACTUALIZAR && sets ? `ON CONFLICT (id) DO UPDATE SET ${sets}` : 'ON CONFLICT (id) DO NOTHING';

  let ultimoId = null;
  let leidas = 0;
  for (;;) {
    const { rows } = await origen.query(
      `SELECT COALESCE(json_agg(t ORDER BY t.id), '[]'::json)::text AS lote, COUNT(*)::int AS n, MAX(t.id) AS ult
         FROM (SELECT * FROM "${tabla}" ${ultimoId == null ? '' : 'WHERE id > $1'} ORDER BY id LIMIT ${LOTE}) t`,
      ultimoId == null ? [] : [ultimoId]
    );
    if (rows[0].n === 0) break;
    await destino.query(`INSERT INTO "${tabla}" SELECT * FROM json_populate_recordset(null::"${tabla}", $1::json) ${conflicto}`, [rows[0].lote]);
    leidas += rows[0].n;
    ultimoId = rows[0].ult;
    if (rows[0].n < LOTE) break;
  }
  // La secuencia del id queda detrás del máximo copiado (si no, el próximo INSERT choca).
  await destino.query(
    `SELECT setval(pg_get_serial_sequence('"${tabla}"', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM "${tabla}"), 1), 1))
      WHERE pg_get_serial_sequence('"${tabla}"', 'id') IS NOT NULL`
  );
  return leidas;
}

(async () => {
  const origen = new Client(ORIGEN);
  const destino = new Client({ connectionString: DESTINO_URL });
  await origen.connect();
  await destino.connect();
  await origen.query('SET default_transaction_read_only = on'); // el origen JAMÁS se escribe
  console.log(`Origen  : ${ORIGEN.host}:${ORIGEN.port}/${ORIGEN.database} (solo lectura)`);
  console.log(`Destino : ${new URL(DESTINO_URL).host}${new URL(DESTINO_URL).pathname}`);
  console.log(`Modo    : ${SOLO_VERIFICAR ? 'solo verificar' : ACTUALIZAR ? 'pasada final (actualiza)' : 'primera copia (no pisa)'}\n`);

  let diferencias = 0;
  for (const tabla of TABLAS) {
    const t0 = Date.now();
    if (!SOLO_VERIFICAR) await copiar(origen, destino, tabla);
    const [a, b] = [await contar(origen, tabla), await contar(destino, tabla)];
    const ok = a === b;
    if (!ok) diferencias += 1;
    console.log(`${ok ? 'OK   ' : 'DIFF '} ${tabla.padEnd(26)} origen ${String(a).padStart(8)} | destino ${String(b).padStart(8)}  ${SOLO_VERIFICAR ? '' : `(${Math.round((Date.now() - t0) / 100) / 10}s)`}`);
  }
  await origen.end();
  await destino.end();
  console.log(diferencias === 0 ? '\nTodas las tablas coinciden.' : `\n${diferencias} tabla(s) con diferencias.`);
  process.exit(diferencias === 0 ? 0 : 2);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
