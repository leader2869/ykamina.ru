import pg from 'pg';

const baseUrl = 'https://realflame.ru';
const databaseUrl = process.env.DATABASE_URL;
const limit = Number(process.env.REALFLAME_COMPATIBILITY_LIMIT || 0);
const concurrency = Math.max(1, Number(process.env.REALFLAME_COMPATIBILITY_CONCURRENCY || 1));
const requestDelay = Math.max(1_000, Number(process.env.REALFLAME_COMPATIBILITY_DELAY_MS || 1_500));

if (!databaseUrl) throw new Error('DATABASE_URL is required. Set it in frontend/.env.local.');

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });
const unique = (items) => [...new Set(items)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function productLinks(html) {
  return unique([...html.matchAll(/href="(\/catalog\/[^"?#]+)(?:\?[^"#]*)?"/g)].map((match) => match[1]));
}

function asText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');
}

function articleFromPage(html) {
  const match = asText(html).match(/Артикул\s*:?[\s]*([A-ZА-Я0-9][A-ZА-Я0-9._/-]{2,})/iu);
  return match?.[1] || null;
}

function compatiblePortalLinks(html) {
  const start = html.search(/Подходящие\s+порталы/i);
  if (start < 0) return [];
  const section = html.slice(start, start + 150_000);
  return unique(productLinks(section).filter((link) => link.startsWith('/catalog/portaly/')));
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Ykamina compatibility importer/1.0 (+https://ykamina.ru)' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      const text = await response.text();
      await sleep(requestDelay);
      return text;
    } catch (error) {
      lastError = error;
      await sleep(requestDelay * attempt * 2);
    }
  }
  throw lastError;
}

async function findProductPage(article) {
  const search = await fetchText(`${baseUrl}/search/index.php?q=${encodeURIComponent(article)}`);
  for (const link of productLinks(search)) {
    const pageUrl = `${baseUrl}${link}`;
    const page = await fetchText(pageUrl);
    if (articleFromPage(page) === article) return { pageUrl, page };
  }
  return null;
}

await client.connect();
let runId;
try {
  const supplier = await client.query(`SELECT id FROM suppliers WHERE url = 'https://realflame.ru' LIMIT 1`);
  if (!supplier.rowCount) throw new Error('RealFlame supplier not found. Run npm run supplier:realflame first.');
  runId = (await client.query(`INSERT INTO import_runs (supplier_id, source_url, status) VALUES ($1, $2, 'running') RETURNING id`, [supplier.rows[0].id, `${baseUrl}/search/`])).rows[0].id;
  const hearths = (await client.query(
    `SELECT p.id, p.supplier_sku FROM products p
     JOIN categories c ON c.id = p.category_id
     JOIN categories parent ON parent.id = c.parent_id
     WHERE p.is_published = TRUE AND p.supplier_sku IS NOT NULL AND parent.slug = 'электроочаги'
     ORDER BY p.supplier_sku ${limit ? 'LIMIT $1' : ''}`,
    limit ? [limit] : [],
  )).rows;
  const productIdByArticle = new Map((await client.query(`SELECT id, supplier_sku FROM products WHERE supplier_sku IS NOT NULL`)).rows.map((row) => [row.supplier_sku, row.id]));
  const portalArticleCache = new Map();
  let processed = 0;
  let linksSaved = 0;
  let cursor = 0;

  async function portalIdFromUrl(url) {
    if (!portalArticleCache.has(url)) {
      const page = await fetchText(url);
      portalArticleCache.set(url, articleFromPage(page));
    }
    const article = portalArticleCache.get(url);
    return article ? productIdByArticle.get(article) : null;
  }

  async function worker() {
    while (cursor < hearths.length) {
      const hearth = hearths[cursor++];
      processed += 1;
      try {
        const supplierPage = await findProductPage(hearth.supplier_sku);
        if (!supplierPage) throw new Error('supplier page not found');
        const portalUrls = compatiblePortalLinks(supplierPage.page);
        await client.query(`DELETE FROM product_compatibilities WHERE hearth_product_id = $1`, [hearth.id]);
        for (const path of portalUrls) {
          const sourceUrl = `${baseUrl}${path}`;
          const portalId = await portalIdFromUrl(sourceUrl);
          if (!portalId) continue;
          await client.query(
            `INSERT INTO product_compatibilities (hearth_product_id, portal_product_id, source_url)
             VALUES ($1, $2, $3) ON CONFLICT (hearth_product_id, portal_product_id)
             DO UPDATE SET source_url = EXCLUDED.source_url, updated_at = NOW()`,
            [hearth.id, portalId, supplierPage.pageUrl],
          );
          linksSaved += 1;
        }
      } catch (error) {
        console.warn(`Compatibility skipped for ${hearth.supplier_sku}: ${error.message}`);
      }
      if (processed % 10 === 0) console.log(`Compatibility progress: ${processed}/${hearths.length}; saved ${linksSaved} links.`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  await client.query(`UPDATE import_runs SET status = 'success', updated_count = $1, finished_at = NOW() WHERE id = $2`, [linksSaved, runId]);
  console.log(`RealFlame compatibility import complete: processed ${processed}; saved ${linksSaved} links.`);
} catch (error) {
  if (runId) await client.query(`UPDATE import_runs SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`, [String(error.message || error), runId]);
  throw error;
} finally {
  await client.end();
}
