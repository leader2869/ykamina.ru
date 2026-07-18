import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  const parent = await client.query(
    `INSERT INTO categories (name, slug, description, parent_id)
     VALUES ('Биокамины', 'биокамины', 'Биокамины для дома', NULL)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  );
  const child = await client.query(
    `INSERT INTO categories (name, slug, description, parent_id)
     VALUES ('Биокамины', 'биокамины-биокамины', 'Все модели биокаминов', $1)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id
     RETURNING id`,
    [parent.rows[0].id],
  );
  const result = await client.query(
    `UPDATE products
     SET category_id = $1,
         is_published = COALESCE(jsonb_array_length(images), 0) > 0,
         updated_at = NOW()
     WHERE name ILIKE '%биокамин%' OR description ILIKE '%биокамин%'`,
    [child.rows[0].id],
  );
  await client.query('COMMIT');
  console.log(`Biofireplaces published: ${result.rowCount}.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
