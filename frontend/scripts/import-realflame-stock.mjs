import pg from 'pg';
import XLSX from 'xlsx';

const sourceUrl = process.env.REALFLAME_STOCK_URL || 'https://realflame.ru/price/RealFlameStock.xlsx';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required. Set it in frontend/.env.local.');

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });
await client.connect();
let runId;
try {
  const supplier = await client.query(`SELECT id FROM suppliers WHERE url = 'https://realflame.ru' LIMIT 1`);
  if (!supplier.rowCount) throw new Error('RealFlame supplier not found. Run npm run supplier:realflame first.');
  const supplierId = supplier.rows[0].id;
  runId = (await client.query(`INSERT INTO import_runs (supplier_id, source_url, status) VALUES ($1, $2, 'running') RETURNING id`, [supplierId, sourceUrl])).rows[0].id;
  const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'Ykamina supplier importer/1.0' } });
  if (!response.ok) throw new Error(`RealFlame returned HTTP ${response.status}`);
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer', raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  let updated = 0;

  for (const row of rows) {
    const article = String(row['Артикул'] ?? row['Артикул товара'] ?? row['ARTICLE'] ?? '').trim();
    if (!article) continue;
    const availability = {
      moscow: String(row['Наличие в МСК'] ?? '').trim() || null,
      saintPetersburg: String(row['Наличие в СПБ'] ?? '').trim() || null,
      wholesalePrice: Number(row['Цена ОПТ']) || null,
      recommendedRetailPrice: Number(row['Цена РРЦ']) || null,
      sourceUpdatedAt: new Date().toISOString(),
    };
    const result = await client.query(
      `UPDATE products SET availability = $1::jsonb, supplier_updated_at = NOW(), updated_at = NOW()
       WHERE supplier_sku = $2`,
      [JSON.stringify(availability), article],
    );
    updated += result.rowCount;
  }

  await client.query(`UPDATE import_runs SET status = 'success', updated_count = $1, finished_at = NOW() WHERE id = $2`, [updated, runId]);
  console.log(`RealFlame stock import complete: updated ${updated} products.`);
} catch (error) {
  if (runId) await client.query(`UPDATE import_runs SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`, [String(error.message || error), runId]);
  throw error;
} finally {
  await client.end();
}
