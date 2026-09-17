import { parse } from 'csv-parse/sync';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { articleFromRow, assertSupplierRows, createImageCache } from './lib/supplier-images.mjs';
import { loadExactPhotobank } from './lib/photobank-exact.mjs';

// Only photographs are changed. Prices, stock, publication and orders stay intact.
const apply = process.argv.includes('--apply');
const reportDir = process.env.IMAGE_REPAIR_REPORT_DIR || join(process.cwd(), '.image-repair');
const mediaDir = join(process.cwd(), 'public/media/realflame');
const cacheImage = createImageCache(mediaDir);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const sourceUrl = process.env.REALFLAME_CSV_URL || 'https://realflame.ru/upload/partners.csv';
const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Supplier feed HTTP ${response.status}`);
const feed = parse(await response.text(), { columns: true, delimiter: ';', bom: true, skip_empty_lines: true, relax_quotes: true, trim: true });
assertSupplierRows(feed);
const byArticle = new Map(feed.map((row) => [articleFromRow(row), row]));
await client.connect();
const run = new Date().toISOString().replace(/[:.]/g, '-');
try {
  const lock = await client.query('SELECT pg_try_advisory_lock(91347, 2) AS locked');
  if (!lock.rows[0].locked) throw new Error('Another image repair is already running');
  const products = (await client.query('SELECT id, name, supplier_sku, images FROM products WHERE is_published = TRUE ORDER BY id')).rows;
  const priority = (product) => byArticle.get(product.supplier_sku)?.['Детальная картинка (путь)']?.trim() ? 0 : product.images?.some((image) => image.startsWith('/media/')) ? 1 : 2;
  products.sort((a, b) => priority(a) - priority(b));
  await mkdir(reportDir, { recursive: true, mode: 0o700 });
  // Save original values before the first update, for exact rollback.
  await writeFile(join(reportDir, `${run}-before.json`), JSON.stringify(products, null, 2), { mode: 0o600 });
  const report = { run, apply, total: products.length, updated: 0, healthy: 0, unresolved: [], conflicts: [], failures: [], sources: {} };
  let photobank;
  try { photobank = await loadExactPhotobank(); }
  catch (error) { console.warn(`Photobank unavailable; continuing exact CSV recovery: ${error.message}`); }
  const localChecks = new Map();
  async function localImage(url) {
    if (!/^\/media\/realflame\/[a-zA-Z0-9_-]+\.(webp|jpe?g|png)$/i.test(url)) return null;
    if (!localChecks.has(url)) localChecks.set(url, (async () => {
      try {
        const file = join(mediaDir, url.split('/').at(-1));
        await access(file);
        const image = sharp(await readFile(file));
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height) return null;
        if (metadata.format === 'webp' && metadata.width <= 1200 && metadata.height <= 1200) return url;
        const filename = url.split('/').at(-1).replace(/\.(webp|jpe?g|png)$/i, '-optimized.webp');
        const destination = join(mediaDir, filename);
        const { rename } = await import('node:fs/promises');
        await image.rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(`${destination}.${process.pid}.tmp`);
        await rename(`${destination}.${process.pid}.tmp`, destination);
        return `/media/realflame/${filename}`;
      } catch { return null; }
    })());
    return localChecks.get(url);
  }
  let cursor = 0;
  async function worker() {
    while (cursor < products.length) {
      const product = products[cursor++];
      const oldImages = Array.isArray(product.images) ? product.images.filter((value) => typeof value === 'string') : [];
      const row = byArticle.get(product.supplier_sku);
      const source = row?.['Детальная картинка (путь)']?.trim();
      const verified = [];
      // The supplier's exact article is authoritative; never guess by name/color.
      if (source) {
        try { verified.push(await cacheImage(source)); report.sources.currentFeed = (report.sources.currentFeed || 0) + 1; }
        catch (error) { report.failures.push({ id: product.id, article: product.supplier_sku, reason: error.message }); }
      }
      for (const image of oldImages) {
        const local = await localImage(image);
        if (local && !verified.includes(local)) verified.push(local);
      }
      if (!verified.length) {
        const file = photobank?.find(product);
        if (file) {
          try { verified.push(await photobank.cache(file, cacheImage)); report.sources.exactPhotobank = (report.sources.exactPhotobank || 0) + 1; }
          catch (error) { report.failures.push({ id: product.id, article: product.supplier_sku, reason: error.message }); }
        }
      }
      if (!verified.length) {
        for (const image of oldImages.slice(0, 3)) {
          if (!image.startsWith('https://realflame.ru/upload/')) continue;
          try { verified.push(await cacheImage(image)); break; }
          catch { /* Try the next exact existing image, never substitute a different model. */ }
        }
      }
      if (!verified.length) report.unresolved.push({ id: product.id, article: product.supplier_sku, name: product.name, inCurrentFeed: Boolean(row) });
      else if (JSON.stringify(oldImages) === JSON.stringify(verified)) report.healthy++;
      else if (apply) {
        const changed = await client.query('UPDATE products SET images = $1::jsonb, updated_at = NOW() WHERE id = $2 AND images IS NOT DISTINCT FROM $3::jsonb', [JSON.stringify(verified), product.id, JSON.stringify(product.images)]);
        if (changed.rowCount) report.updated++;
        else report.conflicts.push(product.id);
      } else report.updated++;
      if ((report.updated + report.healthy + report.unresolved.length + report.conflicts.length) % 25 === 0) {
        console.log(JSON.stringify({ processed: report.updated + report.healthy + report.unresolved.length + report.conflicts.length, updated: report.updated, healthy: report.healthy, unresolved: report.unresolved.length }));
        await writeFile(join(reportDir, `${run}-report.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
      }
    }
  }
  await Promise.all([worker(), worker()]);
  await writeFile(join(reportDir, `${run}-report.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ...report, unresolved: report.unresolved.length, failures: report.failures.length }));
  console.log(`Full report: ${join(reportDir, `${run}-report.json`)}`);
} finally { await client.end(); }
