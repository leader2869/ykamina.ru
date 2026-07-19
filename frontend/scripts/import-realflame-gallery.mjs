import pg from 'pg';
import { refreshProductVisibility } from './lib/refresh-product-visibility.mjs';

const baseUrl = 'https://realflame.ru';
const databaseUrl = process.env.DATABASE_URL;
const limit = Number(process.env.REALFLAME_GALLERY_LIMIT || 0);
const requestDelayMs = Number(process.env.REALFLAME_GALLERY_DELAY_MS || 1_500);
const requestRetries = Number(process.env.REALFLAME_GALLERY_RETRIES || 3);
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const { Client } = pg;
const unique = (items) => [...new Set(items)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let client;

async function closeDatabase() {
  if (!client) return;
  try {
    await client.end();
  } catch {
    // The connection may already be closed after a provider-side timeout.
  }
  client = undefined;
}

async function connectDatabase() {
  const nextClient = new Client({ connectionString: databaseUrl });
  // Prevent a provider-side idle timeout from turning into an unhandled event.
  nextClient.on('error', (error) => console.warn(`Gallery database connection interrupted: ${error.message}`));
  await nextClient.connect();
  client = nextClient;
  return client;
}

async function withDatabase(operation) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      if (!client) await connectDatabase();
      return await operation(client);
    } catch (error) {
      lastError = error;
      const reconnectable = ['57P05', '57P01', '08003', '08006', 'ECONNRESET'].includes(error.code) || /connection|timeout/i.test(error.message || '');
      if (!reconnectable || attempt === 2) throw error;
      console.warn(`Gallery database reconnect ${attempt}/1: ${error.message}`);
      await closeDatabase();
      await sleep(500);
    }
  }
  throw lastError;
}

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

let runId;
try {
  const supplier = await withDatabase((db) => db.query(`SELECT id FROM suppliers WHERE url = 'https://realflame.ru' LIMIT 1`));
  if (!supplier.rowCount) throw new Error('RealFlame supplier not found. Run npm run supplier:realflame first.');
  runId = (await withDatabase((db) => db.query(`INSERT INTO import_runs (supplier_id, source_url, status) VALUES ($1, $2, 'running') RETURNING id`, [supplier.rows[0].id, 'https://realflame.ru/search/']))).rows[0].id;
  const products = (await withDatabase((db) => db.query(
    `SELECT p.id, p.supplier_sku, p.images FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN categories parent ON parent.id = c.parent_id
     WHERE p.supplier_sku IS NOT NULL AND p.price > 0
       AND COALESCE(parent.slug, c.slug, '') <> 'другое'
       AND jsonb_array_length(p.images) <= 1
     ORDER BY p.updated_at DESC ${limit ? 'LIMIT $1' : ''}`,
    limit ? [limit] : [],
  ))).rows;
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
          await withDatabase((db) => db.query(
            `UPDATE products SET images = $1::jsonb, supplier_product_url = $2, supplier_updated_at = NOW(), updated_at = NOW() WHERE id = $3`,
            [JSON.stringify(images), gallery.pageUrl, product.id],
          ));
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
  const visibilityUpdated = await withDatabase((db) => refreshProductVisibility(db));
  await withDatabase((db) => db.query(`UPDATE import_runs SET status = 'success', updated_count = $1, finished_at = NOW() WHERE id = $2`, [updated, runId]));
  console.log(`Visibility refreshed for ${visibilityUpdated} products.`);
  console.log(`RealFlame gallery import complete: updated ${updated} of ${products.length} products.`);
} catch (error) {
  if (runId) await withDatabase((db) => db.query(`UPDATE import_runs SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`, [String(error.message || error), runId]));
  throw error;
} finally {
  await closeDatabase();
}
