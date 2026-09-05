import 'dotenv/config';
import pg from 'pg';
const connectionString = process.env.DATABASE_URL;
if (!connectionString || !['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname)) {
  throw new Error('Preflight ini hanya boleh dijalankan pada database lokal.');
}
const client = new pg.Client({connectionString});
await client.connect();
try {
  for (const table of ['product_alias', 'unit_alias']) {
    const { rows } = await client.query(`SELECT count(*)::int AS collisions FROM (SELECT lower(regexp_replace(btrim(alias_name), '[[:space:]]+', ' ', 'g')) FROM ${table} GROUP BY 1 HAVING count(*) > 1) duplicates`);
    console.log(`${table}: ${rows[0].collisions} normalized collisions`);
    if (rows[0].collisions) throw new Error('Migration diblokir: alias lama perlu ditinjau tanpa koreksi otomatis.');
  }
  const {rows} = await client.query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 3');
  console.log('Latest applied migrations:', rows.map((row) => row.migration_name));
} finally { await client.end(); }
