import pg from 'pg';

const baseUrl = 'https://realflame.ru';
const databaseUrl = process.env.DATABASE_URL;
const limit = Number(process.env.REALFLAME_GALLERY_LIMIT || 0);
const requestDelayMs = Number(process.env.REALFLAME_GALLERY_DELAY_MS || 1_500);
const requestRetries = Number(process.env.REALFLAME_GALLERY_RETRIES || 3);
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });
const unique = (items) => [...new Set(items)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function productLinks(html) {
  return unique([...html.matchAll(/href="(\/catalog\/[^"?#]+)(?:\?[^"#]*)?"/g)].map((match) => match[1]));
}

function galleryImages(html) {
  return unique([...html.matchAll(/href="(\/upload\/iblock\/[^"?#]+\.(?:jpe?g|png|webp))"/gi)].map((match) => `${baseUrl}${match[1]}`));
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= requestRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Ykamina RealFlame gallery importer/1.1 (+https://ykamina.ru)' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < requestRetries) {
        const pause = requestDelayMs * attempt;
        console.warn(`Gallery request retry ${attempt}/${requestRetries - 1}: ${url}; waiting ${pause}ms.`);
        await sleep(pause);
      }
    } finally {
      // One shared, sequential request stream keeps supplier traffic gentle.
      await sleep(requestDelayMs);
    }
  }
  throw lastError;
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
    `SELECT id, supplier_sku, images FROM products
     WHERE is_published = TRUE AND supplier_sku IS NOT NULL AND jsonb_array_length(images) <= 1
     ORDER BY updated_at DESC ${limit ? 'LIMIT $1' : ''}`,
    limit ? [limit] : [],
  )).rows;
  let updated = 0;
  let processed = 0;
  for (const product of products) {
    processed += 1;
    try {
      const gallery = await findGallery(product.supplier_sku);
      if (gallery?.images.length) {
        // Never replace the main image: append only new gallery URLs.
        const images = unique([...(Array.isArray(product.images) ? product.images : []), ...gallery.images]);
        if (images.length > (Array.isArray(product.images) ? product.images.length : 0)) {
          await client.query(
            `UPDATE products SET images = $1::jsonb, supplier_product_url = $2, supplier_updated_at = NOW(), updated_at = NOW() WHERE id = $3`,
            [JSON.stringify(images), gallery.pageUrl, product.id],
          );
          updated += 1;
        }
      }
    } catch (error) {
      console.warn(`Gallery skipped for ${product.supplier_sku}: ${error.message}`);
    }
    if (processed % 10 === 0 || processed === products.length) {
      console.log(`Gallery progress: ${processed}/${products.length}; updated ${updated}; remaining ${products.length - processed}.`);
    }
  }
  await client.query(`UPDATE import_runs SET status = 'success', updated_count = $1, finished_at = NOW() WHERE id = $2`, [updated, runId]);
  console.log(`RealFlame gallery import complete: updated ${updated} of ${products.length} products.`);
} catch (error) {
  if (runId) await client.query(`UPDATE import_runs SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`, [String(error.message || error), runId]);
  throw error;
} finally {
  await client.end();
}
