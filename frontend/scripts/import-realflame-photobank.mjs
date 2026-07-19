import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import pg from 'pg';
import { refreshProductVisibility } from './lib/refresh-product-visibility.mjs';

const publicKey = 'https://disk.yandex.ru/d/75LasP9HNbhxGQ';
const rootPath = '/фотобанк RealFlame';
const apiUrl = 'https://cloud-api.yandex.net/v1/disk/public/resources';
const downloadApiUrl = 'https://cloud-api.yandex.net/v1/disk/public/resources/download';
const outputDir = join(process.cwd(), 'public', 'media', 'realflame');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });
const stopWords = new Set(['электрокамин', 'электроочаг', 'камин', 'портал', 'realflame', 'реалфлейм', 'обрамление', 'с', 'для']);
const normalizeTokens = (value) => [...new Set(String(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((token) => token.length > 1 && !stopWords.has(token)))];
const similarity = (productName, folderName) => {
  const left = normalizeTokens(productName);
  const right = new Set(normalizeTokens(folderName));
  const matches = left.filter((token) => right.has(token));
  return { matches: matches.length, score: matches.length / Math.max(left.length, 1) };
};
const isImage = (item) => item.type === 'file' && /^image\/(jpeg|png|webp)$/i.test(item.mime_type || '');

async function api(path, offset = 0) {
  const url = new URL(apiUrl);
  url.searchParams.set('public_key', publicKey);
  url.searchParams.set('path', path);
  url.searchParams.set('limit', '1000');
  url.searchParams.set('offset', String(offset));
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Disk API HTTP ${response.status} for ${path}`);
  const data = await response.json();
  const items = data._embedded?.items || [];
  return data._embedded?.total > offset + items.length ? items.concat(await api(path, offset + items.length)) : items;
}

async function listFiles() {
  let queue = [rootPath];
  const files = [];
  while (queue.length) {
    const batch = queue.splice(0, 5);
    const results = await Promise.all(batch.map(api));
    queue = results.flat().filter((item) => item.type === 'dir').map((item) => item.path).concat(queue);
    files.push(...results.flat().filter((item) => item.type === 'file'));
  }
  return files.filter(isImage);
}

async function download(file, filename) {
  const url = new URL(downloadApiUrl);
  url.searchParams.set('public_key', publicKey);
  url.searchParams.set('path', file.path);
  const meta = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!meta.ok) throw new Error(`Download URL HTTP ${meta.status}`);
  const href = (await meta.json()).href;
  const asset = await fetch(href, { signal: AbortSignal.timeout(40_000) });
  if (!asset.ok) throw new Error(`Image HTTP ${asset.status}`);
  await writeFile(join(outputDir, filename), Buffer.from(await asset.arrayBuffer()));
  return `/media/realflame/${filename}`;
}

await client.connect();
let runId;
try {
  const supplier = await client.query(`SELECT id FROM suppliers WHERE url = 'https://realflame.ru' LIMIT 1`);
  runId = (await client.query(`INSERT INTO import_runs (supplier_id, source_url, status) VALUES ($1, $2, 'running') RETURNING id`, [supplier.rows[0]?.id || null, publicKey])).rows[0].id;
  await mkdir(outputDir, { recursive: true });
  const [productsResult, files] = await Promise.all([client.query(`
    SELECT p.id, p.name, p.supplier_sku FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN categories parent ON parent.id = c.parent_id
    WHERE p.supplier_sku IS NOT NULL AND p.price > 0
      AND COALESCE(parent.slug, c.slug, '') <> 'другое'
  `), listFiles()]);
  const byFolder = new Map();
  for (const file of files) {
    const segments = file.path.split('/');
    const folder = segments.at(-2);
    if (!folder) continue;
    const group = byFolder.get(folder) || [];
    group.push(file);
    byFolder.set(folder, group);
  }
  const matches = [];
  for (const product of productsResult.rows) {
    let best;
    for (const [folder, folderFiles] of byFolder) {
      const result = similarity(product.name, folder);
      if (!best || result.score > best.score || (result.score === best.score && result.matches > best.matches)) best = { ...result, folder, folderFiles };
    }
    if (best && best.matches >= 2 && best.score >= 0.5) matches.push({ product, ...best });
  }
  let cursor = 0;
  let updated = 0;
  const workers = Array.from({ length: 3 }, async () => {
    while (cursor < matches.length) {
      const match = matches[cursor++];
      try {
        const localImages = [];
        for (const [index, file] of match.folderFiles.entries()) {
          const extension = extname(file.name) || '.jpg';
          localImages.push(await download(file, `${match.product.supplier_sku}-${index + 1}${extension.toLowerCase()}`));
        }
        if (localImages.length) {
          await client.query(`UPDATE products SET images = $1::jsonb, supplier_updated_at = NOW(), updated_at = NOW() WHERE id = $2`, [JSON.stringify(localImages), match.product.id]);
          updated += 1;
        }
      } catch (error) { console.warn(`Photobank skipped for ${match.product.supplier_sku}: ${error.message}`); }
      if (cursor % 25 === 0) console.log(`Photobank progress: ${cursor}/${matches.length}; updated ${updated}.`);
    }
  });
  await Promise.all(workers);
  const visibilityUpdated = await refreshProductVisibility(client);
  await client.query(`UPDATE import_runs SET status = 'success', updated_count = $1, finished_at = NOW() WHERE id = $2`, [updated, runId]);
  console.log(`RealFlame photobank import complete: matched ${matches.length}, updated ${updated}, indexed ${files.length} images; visibility refreshed for ${visibilityUpdated}.`);
} catch (error) {
  if (runId) await client.query(`UPDATE import_runs SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`, [String(error.message || error), runId]);
  throw error;
} finally { await client.end(); }
