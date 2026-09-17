import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export const articleFromRow = (row) => String(row['Артикул [CML2_ARTICLE]'] || row['Артикул [ARTICLE]'] || '').trim();

export function assertSupplierRows(rows) {
  if (!rows.length || !rows.some((row) => articleFromRow(row))) {
    throw new Error('Supplier feed has no recognized article column; refusing to import an empty catalog.');
  }
}

export function mergeProductImages(existing, incoming) {
  const images = Array.isArray(existing) ? existing.filter((value) => typeof value === 'string' && value) : [];
  return [...new Set([...images.filter((value) => value.startsWith('/')), ...incoming, ...images.filter((value) => !value.startsWith('/'))])];
}

export function createImageCache(outputDir) {
  const tasks = new Map();
  sharp.cache(false);
  sharp.concurrency(1);
  return function cacheImage(source) {
    if (tasks.has(source)) return tasks.get(source);
    const task = (async () => {
      const url = new URL(source, 'https://realflame.ru');
      if (url.protocol !== 'https:' || url.hostname !== 'realflame.ru' || !url.pathname.startsWith('/upload/')) {
        throw new Error('Unsupported supplier image URL');
      }
      const hash = createHash('sha256').update(url.href).digest('hex').slice(0, 24);
      const filename = `${hash}-verified.webp`;
      const destination = join(outputDir, filename);
      try {
        const existing = await readFile(destination);
        const metadata = await sharp(existing).metadata();
        if (metadata.width && metadata.height) return `/media/realflame/${filename}`;
      } catch { /* Missing or invalid cache: download and validate before publishing. */ }
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Supplier image HTTP ${response.status}`);
      if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error('Supplier returned a non-image response');
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 25 * 1024 * 1024) throw new Error('Supplier image exceeds 25 MB');
        chunks.push(chunk);
      }
      const optimized = await sharp(Buffer.concat(chunks), { limitInputPixels: 50_000_000 })
        .rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 }).toBuffer();
      await mkdir(outputDir, { recursive: true });
      const temporary = `${destination}.${process.pid}.tmp`;
      try {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(temporary, optimized);
        await rename(temporary, destination);
      } finally { await unlink(temporary).catch(() => {}); }
      return `/media/realflame/${filename}`;
    })();
    tasks.set(source, task);
    return task;
  };
}
