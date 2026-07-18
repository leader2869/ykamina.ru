import pg from 'pg';

const baseUrl = 'https://realflame.ru';
const databaseUrl = process.env.DATABASE_URL;
const limit = Number(process.env.REALFLAME_GALLERY_LIMIT || 0);
const concurrency = 2;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });
const unique = (items) => [...new Set(items)];

function productLinks(html) {
  return unique([...html.matchAll(/href="(\/catalog\/[^"?#]+)(?:\?[^"#]*)?"/g)].map((match) => match[1]));
}

function galleryImages(html) {
  return unique([...html.matchAll(/href="(\/upload\/iblock\/[^"?#]+\.(?:jpe?g|png|webp))"/gi)].map((match) => `${baseUrl}${match[1]}`));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Ykamina RealFlame gallery importer/1.0 (+https://ykamina.ru)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

async function findGallery(article) {
  const search = await fetchText(`${baseUrl}/search/index.php?q=${encodeURIComponent(article)}`);
  for (const link of productLinks(search)) {
    const pageUrl = `${baseUrl}${link}`;
    const page = await fetchText(pageUrl);
    const normalized = page.toLowerCase();
    if (!normalized.includes(`артикул: ${article}`) && !normalized.includes(`артикул</span>\n\t\t\t\t\t\t\t\t\t\t\t${article}`)) continue;
    const images = galleryImages(page);
    if (images.length) return { pageUrl, images };
  }
  return null;
}

await client.connect();
let runId;
try {
  const supplier = await client.query(`SELECT id FROM suppliers WHERE url = 'https://realflame.ru' LIMIT 1`);
  if (!supplier.rowCount) throw new Error('RealFlame supplier not found. Run npm run supplier:realflame first.');
  runId = (await client.query(`INSERT INTO import_runs (supplier_id, source_url, status) VALUES ($1, $2, 'running') RETURNING id`, [supplier.rows[0].id, 'https://realflame.ru/search/'])).rows[0].id;
  const products = (await client.query(
    `SELECT id, supplier_sku FROM products
     WHERE is_published = TRUE AND supplier_sku IS NOT NULL AND jsonb_array_length(images) <= 1
     ORDER BY updated_at DESC ${limit ? 'LIMIT $1' : ''}`,
    limit ? [limit] : [],
  )).rows;
  let updated = 0;
  let processed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < products.length) {
      const product = products[cursor++];
      processed += 1;
      try {
        const gallery = await findGallery(product.supplier_sku);
        if (gallery?.images.length) {
          await client.query(
            `UPDATE products SET images = $1::jsonb, supplier_product_url = $2, supplier_updated_at = NOW(), updated_at = NOW() WHERE id = $3`,
            [JSON.stringify(gallery.images), gallery.pageUrl, product.id],
          );
          updated += 1;
        }
      } catch (error) {
        console.warn(`Gallery skipped for ${product.supplier_sku}: ${error.message}`);
      }
      if (processed % 25 === 0) console.log(`Gallery progress: ${processed}/${products.length}; updated ${updated}.`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  await client.query(`UPDATE import_runs SET status = 'success', updated_count = $1, finished_at = NOW() WHERE id = $2`, [updated, runId]);
  console.log(`RealFlame gallery import complete: updated ${updated} of ${products.length} products.`);
} catch (error) {
  if (runId) await client.query(`UPDATE import_runs SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`, [String(error.message || error), runId]);
  throw error;
} finally {
  await client.end();
}
