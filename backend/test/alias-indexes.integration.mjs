import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname)) throw new Error('Only a local database is allowed.');
const client = new pg.Client({connectionString});
await client.connect();
try {
  await client.query('BEGIN');
  // Temporary relations shadow the real tables. Everything is rolled back.
  await client.query(`CREATE TEMP TABLE product_alias(alias_name text);
    CREATE TEMP TABLE unit_alias(alias_name text);
    CREATE TEMP TABLE product(product_name text);
    CREATE TEMP TABLE unit(unit_name text);
    CREATE TEMP TABLE permission(permission_code text UNIQUE, permission_name text, module text, action text, is_active boolean);`);
  const migration = readFileSync(new URL('../prisma/migrations/20260903120000_alias_lookup_indexes/migration.sql', import.meta.url),'utf8')
    .replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
  await client.query(migration);
  for (const table of ['product_alias','unit_alias']) {
    await client.query(`INSERT INTO ${table}(alias_name) VALUES ('Ka Mix')`);
    await client.query('SAVEPOINT duplicate_test');
    await assert.rejects(client.query(`INSERT INTO ${table}(alias_name) VALUES ('  KA    MIX  ')`), {code:'23505'});
    await client.query('ROLLBACK TO SAVEPOINT duplicate_test');
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 1);
    await client.query('SAVEPOINT batch_test');
    await client.query(`INSERT INTO ${table}(alias_name) VALUES ('new alias')`);
    await assert.rejects(client.query(`INSERT INTO ${table}(alias_name) VALUES ('ka mix')`), {code:'23505'});
    await client.query('ROLLBACK TO SAVEPOINT batch_test');
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 1);
  }
  assert.equal((await client.query('SELECT count(*)::int AS count FROM permission')).rows[0].count, 3);
  console.log('PASS: migration syntax, normalized uniqueness on both alias tables, atomic batch rollback, and permission catalog inserts (temporary tables only).');
} finally { await client.query('ROLLBACK'); await client.end(); }
