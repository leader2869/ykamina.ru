import pg from 'pg';

const baseUrl = 'https://realflame.ru';
const databaseUrl = process.env.DATABASE_URL;
const limit = Number(process.env.REALFLAME_SPECIFICATIONS_LIMIT || 0);
const concurrency = Math.max(1, Math.min(3, Number(process.env.REALFLAME_SPECIFICATIONS_CONCURRENCY || 2)));
const requestDelay = Math.max(500, Number(process.env.REALFLAME_SPECIFICATIONS_DELAY_MS || 900));

if (!databaseUrl) throw new Error('DATABASE_URL is required. Set it in frontend/.env.local.');

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unique = (items) => [...new Set(items)];

function text(value) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&#(?:x[\da-f]+|\d+);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function productLinks(html) {
  return unique([...html.matchAll(/class="search-title"[^>]*>\s*<a href="(\/catalog\/[^"?#]+)/g)].map((match) => match[1]));
}

function articleFromPage(html) {
  return text(html).match(/Артикул\s*:?\s*([A-ZА-Я0-9][A-ZА-Я0-9._/-]{2,})/iu)?.[1] || null;
}

function shouldHide(label, value) {
  return !label || !value || value.length > 240 || /компан(?:ия)?[-\s]*производител|^производитель$|^бренд$|артикул|описани|альтернативн|для\s+(?:ali|ozon|маркет|wb|wildberries)|штрихкод|seo|xml|html|url|ссылка|внутренн|идентификатор/iu.test(label);
}

function extractSpecifications(html) {
  const start = html.search(/id="product-specifics"/i);
  const fragment = start >= 0 ? html.slice(start, start + 180_000) : html;
  const titles = [...fragment.matchAll(/<div[^>]*class="[^"]*\bprop_title\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
    .map((match) => ({ index: match.index, title: text(match[1]) }))
    .filter((item) => item.title);
  const groups = {};
  const itemPattern = /<div([^>]*)class="[^"]*\bspec-item\b[^"]*"([^>]*)>\s*<div[^>]*class="[^"]*\bspec-item__prop\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*\bspec-item__val\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;

  for (const match of fragment.matchAll(itemPattern)) {
    if (/display\s*:\s*none/iu.test(`${match[1]} ${match[2]}`)) continue;
    const label = text(match[3]);
    const value = text(match[4]);
    if (shouldHide(label, value)) continue;
    const previousTitles = titles.filter((title) => title.index < match.index);
    const group = previousTitles.at(-1)?.title || 'Основные характеристики';
    groups[group] ||= {};
    groups[group][label] = value;
  }

  return groups;
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Ykamina catalog importer/1.0 (+https://ykamina.ru)' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      const result = await response.text();
      await sleep(requestDelay);
      return result;
    } catch (error) {
      lastError = error;
      await sleep(requestDelay * attempt * 2);
    }
  }
  throw lastError;
}

async function findProductPage(article) {
  const search = await fetchText(`${baseUrl}/search/?q=${encodeURIComponent(article)}`);
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
  if (!supplier.rowCount) throw new Error('Supplier is not configured. Run npm run supplier:realflame first.');
  runId = (await client.query(
    `INSERT INTO import_runs (supplier_id, source_url, status) VALUES ($1, $2, 'running') RETURNING id`,
    [supplier.rows[0].id, `${baseUrl}/search/`],
  )).rows[0].id;
  const products = (await client.query(
    `SELECT id, supplier_sku FROM products
     WHERE is_published = TRUE AND supplier_sku IS NOT NULL
     ORDER BY supplier_sku ${limit ? 'LIMIT $1' : ''}`,
    limit ? [limit] : [],
  )).rows;
  let cursor = 0;
  let processed = 0;
  let updated = 0;
  let skipped = 0;

  async function worker() {
    while (cursor < products.length) {
      const product = products[cursor++];
      processed += 1;
      try {
        const source = await findProductPage(product.supplier_sku);
        if (!source) throw new Error('supplier page not found');
        const specifications = extractSpecifications(source.page);
        if (!Object.keys(specifications).length) {
          skipped += 1;
          continue;
        }
        await client.query(
          `UPDATE products
           SET specifications = $1::jsonb, supplier_product_url = $2, supplier_updated_at = NOW(), updated_at = NOW()
           WHERE id = $3`,
          [JSON.stringify(specifications), source.pageUrl, product.id],
        );
        updated += 1;
      } catch (error) {
        skipped += 1;
        console.warn(`Specifications skipped for ${product.supplier_sku}: ${error.message}`);
      }
      if (processed % 25 === 0) console.log(`Specifications progress: ${processed}/${products.length}; updated ${updated}; skipped ${skipped}.`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  await client.query(
    `UPDATE import_runs SET status = 'success', updated_count = $1, finished_at = NOW() WHERE id = $2`,
    [updated, runId],
  );
  console.log(`RealFlame specifications import complete: processed ${processed}; updated ${updated}; skipped ${skipped}.`);
} catch (error) {
  if (runId) await client.query(`UPDATE import_runs SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`, [String(error.message || error), runId]);
  throw error;
} finally {
  await client.end();
}
