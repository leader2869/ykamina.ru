import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

// This operation is deliberately limited to the exact 580 cards approved by
// the owner, not every unpublished product or a fresh supplier feed.
const recoveryRun = '2026-09-17T11-47-50-080Z';
const reportDir = process.env.IMAGE_REPAIR_REPORT_DIR || join(process.cwd(), '.image-repair');
const recovery = JSON.parse(await readFile(join(reportDir, `${recoveryRun}-report.json`), 'utf8'));
const original = JSON.parse(await readFile(join(reportDir, `${recoveryRun}-before.json`), 'utf8'));
assert.equal(recovery.run, recoveryRun);
assert.equal(recovery.unresolved.length, 580, 'Unexpected recovery scope');
const targets = new Map(recovery.unresolved.map((product) => [String(product.id), product]));
assert.equal(targets.size, 580);
const snapshots = new Map(original.map((product) => [String(product.id), product]));
const reason = 'Фото не восстановлено: временно скрыт с витрины по решению владельца от 17.09.2026.';
const apply = process.argv.includes('--apply');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '10s'");
  const lock = await client.query('SELECT pg_try_advisory_xact_lock(91347, 2) AS locked');
  assert.ok(lock.rows[0].locked, 'Photo recovery is still running');
  const beforeCounts = (await client.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_published)::int AS published FROM products')).rows[0];
  const rows = (await client.query('SELECT id, name, supplier_sku, images, is_published, visibility_comment, updated_at FROM products WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE', [[...targets.keys()]])).rows;
  assert.equal(rows.length, 580, 'A target product was removed; review before proceeding');
  const selected = [];
  const skipped = [];
  for (const row of rows) {
    const expected = snapshots.get(String(row.id));
    const target = targets.get(String(row.id));
    assert.ok(expected, 'Missing original photo snapshot');
    if (!row.is_published) { skipped.push({ id: row.id, reason: 'Already hidden' }); continue; }
    if (row.supplier_sku !== target.article || JSON.stringify(row.images) !== JSON.stringify(expected.images)) {
      skipped.push({ id: row.id, reason: 'Product or photos changed after recovery; left untouched' });
      continue;
    }
    if (Array.isArray(row.images) && row.images.some((image) => image.startsWith('/media/realflame/'))) {
      skipped.push({ id: row.id, reason: 'Local photo exists; left untouched' });
      continue;
    }
    selected.push(row);
  }
  const run = new Date().toISOString().replace(/[:.]/g, '-');
  await mkdir(reportDir, { recursive: true, mode: 0o700 });
  const backup = join(reportDir, `${run}-visibility-before.json`);
  // A recoverable publication snapshot must exist before any database write.
  await writeFile(backup, JSON.stringify({ recoveryRun, beforeCounts, products: selected }, null, 2), { mode: 0o600, flag: 'wx' });
  let changed = [];
  if (apply && selected.length) {
    changed = (await client.query('UPDATE products SET is_published = FALSE, visibility_comment = $1, updated_at = NOW() WHERE id = ANY($2::bigint[]) AND is_published = TRUE RETURNING id', [reason, selected.map((row) => row.id)])).rows;
    assert.equal(changed.length, selected.length);
  }
  const afterCounts = (await client.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_published)::int AS published FROM products')).rows[0];
  const preserved = (await client.query('SELECT COUNT(*)::int AS count FROM products WHERE id = ANY($1::bigint[])', [[...targets.keys()]])).rows[0].count;
  assert.equal(preserved, 580, 'All cards must remain available to administrators');
  assert.equal(afterCounts.total, beforeCounts.total);
  assert.equal(afterCounts.published, beforeCounts.published - changed.length);
  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  const result = { apply, recoveryRun, selected: selected.length, hidden: changed.length, skipped, beforeCounts, afterCounts, preserved, backup };
  await writeFile(join(reportDir, `${run}-visibility-report.json`), JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { await client.end(); }
