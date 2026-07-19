import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL не задан');

const databaseUrl = new URL(process.env.DATABASE_URL);
if (process.env.DATABASE_PUBLIC_HOST) {
  databaseUrl.hostname = process.env.DATABASE_PUBLIC_HOST;
}
if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
  databaseUrl.searchParams.set('sslmode', 'no-verify');
}

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');
const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
const client = new pg.Client({ connectionString: databaseUrl.toString() });
await client.connect();

try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const applied = await client.query('SELECT filename FROM schema_migrations');
  const appliedFiles = new Set(applied.rows.map((row) => row.filename));

  for (const file of files) {
    if (appliedFiles.has(file)) continue;
    const sql = await readFile(join(migrationsDirectory, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Применена миграция ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log('Схема базы данных актуальна.');
} finally {
  await client.end();
}
