const publicKey = 'https://disk.yandex.ru/d/75LasP9HNbhxGQ';
const endpoint = 'https://cloud-api.yandex.net/v1/disk/public/resources';
const normalize = (value) => value.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function exactFireboxModel(name) {
  if (!/^\s*(электроочаг|очаг)\s/iu.test(name)) return null;
  return normalize(name.replace(/^\s*(электроочаг|очаг)\s+/iu, '').replace(/\brealflame\b/giu, '').split('/')[0]);
}

export async function loadExactPhotobank() {
  const byArticle = new Map();
  const byModel = new Map();
  let queue = ['/фотобанк RealFlame/ПОРТАЛЫ', '/фотобанк RealFlame/ОЧАГИ'];
  let scanned = 0;
  async function list(path, offset = 0) {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries({ public_key: publicKey, path, offset, limit: 1000 })) url.searchParams.set(key, String(value));
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Photobank index HTTP ${response.status}`);
    const data = await response.json();
    const files = data._embedded?.items || [];
    return data._embedded?.total > offset + files.length ? files.concat(await list(path, offset + files.length)) : files;
  }
  while (queue.length) {
    const batch = queue.splice(0, 3);
    const results = await Promise.all(batch.map(async (path) => ({ path, items: await list(path) })));
    for (const { path, items } of results) {
      scanned++;
      queue.push(...items.filter((item) => item.type === 'dir' && !/ИНСТРУКЦИИ|СТЕНДЫ/.test(item.name)).map((item) => item.path));
      const files = items.filter((item) => item.type === 'file' && /^image\/(jpeg|png|webp)$/.test(item.mime_type || '') && !/размер|схем|чертеж|габарит|drawing/iu.test(item.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
      if (!files.length) continue;
      const folder = path.split('/').at(-1);
      const article = folder.match(/^(\d{6,8})(?:\D|$)/)?.[1];
      if (article) byArticle.set(article, files.find((file) => new RegExp(`^${article}\\.(jpe?g|png|webp)$`, 'i').test(file.name)) || files[0]);
      if (path.includes('/ОЧАГИ/')) {
        const key = normalize(folder);
        // Ambiguous duplicate model directories are deliberately not used.
        byModel.set(key, byModel.has(key) ? null : files[0]);
      }
    }
  }
  console.log(`Photobank indexed: ${scanned} folders, ${byArticle.size} exact articles, ${byModel.size} firebox models.`);
  return {
    find(product) { return byArticle.get(product.supplier_sku) || byModel.get(exactFireboxModel(product.name)) || null; },
    async cache(file, cacheImage) {
      const url = new URL(`${endpoint}/download`);
      url.searchParams.set('public_key', publicKey);
      url.searchParams.set('path', file.path);
      return cacheImage(url.href, async (downloadEndpoint) => {
        const response = await fetch(downloadEndpoint, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`Photobank download HTTP ${response.status}`);
        const { href } = await response.json();
        const parsed = new URL(href);
        if (parsed.protocol !== 'https:' || !/(^|\.)yandex\.(ru|net)$/.test(parsed.hostname) && !parsed.hostname.endsWith('.yandex.net')) throw new Error('Unexpected photobank download host');
        return parsed;
      });
    },
  };
}
