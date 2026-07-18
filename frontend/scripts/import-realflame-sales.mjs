import pg from 'pg';

const sourceUrl = process.env.REALFLAME_SALES_URL || 'https://realflame.ru/sales/';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DATABASE_URL is required. Set it in frontend/.env.local.');

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });

const priceFromMarkup = (value) => {
  const normalized = value
    .replace(/&(nbsp|#160|#\d+);/g, ' ')
    .replace(/[^0-9.,\s]/g, '')
    .replace(/\s/g, '');
  const match = normalized.match(/^(\d+)(?:[.,]\d{1,2})?/);
  return match ? Number(match[1]) : null;
};
const salePattern = /product-card__article">\s*Артикул:\s*<span[^>]*>\s*([^<]+)\s*<\/span>[\s\S]{0,1800}?product-price__old[^>]*>\s*([^<]+)/g;

await client.connect();
try {
  const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'Ykamina supplier importer/1.0' } });
  if (!response.ok) throw new Error(`RealFlame returned HTTP ${response.status}`);

  const markup = await response.text();
  const sales = [...markup.matchAll(salePattern)]
    .map((match) => ({ article: match[1].trim(), oldPrice: priceFromMarkup(match[2]) }))
    .filter((sale) => sale.article && sale.oldPrice);

  await client.query('BEGIN');
  await client.query('UPDATE products SET old_price = NULL WHERE old_price IS NOT NULL');
  let updated = 0;
  for (const sale of sales) {
    const result = await client.query(
      `UPDATE products
       SET old_price = $1, updated_at = NOW()
       WHERE supplier_sku = $2 AND price < $1`,
      [sale.oldPrice, sale.article],
    );
    updated += result.rowCount;
  }
  await client.query('COMMIT');
  console.log(`RealFlame sales import complete: ${updated} active promotions updated.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
