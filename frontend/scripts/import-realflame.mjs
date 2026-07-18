import { parse } from 'csv-parse/sync';
import pg from 'pg';

const sourceUrl = process.env.REALFLAME_CSV_URL || 'https://realflame.ru/upload/partners.csv';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DATABASE_URL is required. Set it in frontend/.env.local.');

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });

const normalize = (value) => value?.trim().replace(/^\uFEFF/, '') || '';
const makeSlug = (article) => `realflame-${article.toLowerCase().replace(/[^a-z0-9а-яё]+/giu, '-')}`;
const isAccessory = (name) => /^(пульт|парогенератор|вставка|рамка|панель)/iu.test(name.trim());
const categoryFor = (name) => {
  const value = name.toLowerCase();
  if (isAccessory(name)) return ['Другое', 'Аксессуары'];
  if (value.includes('биокамин')) return ['Биокамины', 'Все биокамины'];
  // Портал может быть «под очаг» — это не электроочаг, а самостоятельный портал.
  if (value.startsWith('портал') || value.includes('портал каминный') || value.includes('обрамление')) {
    const stone = value.includes('камень') || value.includes('мрамор');
    const linear = value.includes('линей') || value.includes('line');
    if (linear && stone) return ['Порталы', 'Линейные из камня'];
    if (linear) return ['Порталы', 'Линейные'];
    if (stone) return ['Порталы', 'Стандартные из камня'];
    return ['Порталы', 'Стандартные'];
  }
  // Комплект — это готовый электрокамин, даже если в названии упомянут отдельный очаг.
  if (value.includes('каминокомплект') || value.includes('электрокамин') || value.startsWith('камин из ')) {
    if (value.includes('лофт')) return ['Электрокамины', 'Лофт'];
    if (value.includes('кантри')) return ['Электрокамины', 'Кантри'];
    if (value.includes('сканди')) return ['Электрокамины', 'Скандинавский стиль'];
    if (value.includes('модерн') || value.includes('modern')) return ['Электрокамины', 'Модерн'];
    return ['Электрокамины', 'Классические'];
  }
  if (value.startsWith('электроочаг') || value.startsWith('очаг ')) {
    if (value.includes('3d') || value.includes('cassette') || value.includes('olympic')) return ['Электроочаги', '3D электроочаги'];
    if (value.includes('линей') || value.includes('line')) return ['Электроочаги', 'Линейные'];
    if (value.includes('встраив')) return ['Электроочаги', 'Встраиваемые'];
    if (value.includes('широк')) return ['Электроочаги', 'Широкие'];
    return ['Электроочаги', 'Классические'];
  }
  return ['Другое', 'Аксессуары'];
};

await client.connect();
let runId;
try {
  const supplierResult = await client.query(
    `INSERT INTO suppliers (name, url) VALUES ('RealFlame', 'https://realflame.ru')
     ON CONFLICT DO NOTHING RETURNING id`,
  );
  const supplierId = supplierResult.rows[0]?.id || (await client.query(`SELECT id FROM suppliers WHERE url = 'https://realflame.ru' LIMIT 1`)).rows[0].id;
  runId = (await client.query(`INSERT INTO import_runs (supplier_id, source_url, status) VALUES ($1, $2, 'running') RETURNING id`, [supplierId, sourceUrl])).rows[0].id;

  const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'Ykamina supplier importer/1.0' } });
  if (!response.ok) throw new Error(`RealFlame returned HTTP ${response.status}`);
  const csv = await response.text();
  const rows = parse(csv, { columns: true, delimiter: ';', bom: true, skip_empty_lines: true, relax_quotes: true, trim: true });
  const categories = new Map();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const name = normalize(row['Наименование элемента']);
    const article = normalize(row['Артикул [ARTICLE]']);
    const price = Number.parseFloat(normalize(row['Цена "Розничная цена"']).replace(',', '.'));
    if (!name || !article || !Number.isFinite(price) || price <= 0) continue;

    const [parentName, categoryName] = categoryFor(name);
    const categoryKey = `${parentName}/${categoryName}`;
    if (!categories.has(categoryKey)) {
      const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9а-яё]+/giu, '-').replace(/^-|-$/g, '');
      const parentSlug = slugify(parentName);
      const parent = await client.query(
        `INSERT INTO categories (name, slug, description, parent_id) VALUES ($1, $2, $3, NULL)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [parentName, parentSlug, 'Раздел каталога RealFlame'],
      );
      const child = await client.query(
        `INSERT INTO categories (name, slug, description, parent_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id RETURNING id`,
        [categoryName, `${parentSlug}-${slugify(categoryName)}`, 'Подкатегория RealFlame', parent.rows[0].id],
      );
      categories.set(categoryKey, child.rows[0].id);
    }

    const image = normalize(row['Детальная картинка (путь)']);
    const dimensions = { height: Number(normalize(row['Высота, мм [HEIGHT]'])) || null, width: Number(normalize(row['Ширина, мм [WIDTH]'])) || null, depth: Number(normalize(row['Глубина, мм [DEPTH]'])) || null };
    const description = normalize(row['Детальное описание']) || `${name}. Товар поставщика RealFlame.`;
    const existing = await client.query('SELECT id FROM products WHERE supplier_sku = $1', [article]);
    const result = await client.query(
      `INSERT INTO products (name, slug, description, price, category_id, images, stock, dimensions, supplier_sku, supplier_updated_at, is_published)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 0, $7::jsonb, $8, NOW(), $9)
       ON CONFLICT (supplier_sku) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description, price = EXCLUDED.price,
         category_id = EXCLUDED.category_id, images = EXCLUDED.images, dimensions = EXCLUDED.dimensions,
         is_published = EXCLUDED.is_published, supplier_updated_at = NOW(), updated_at = NOW()
       RETURNING id`,
      [name, makeSlug(article), description, price, categories.get(categoryKey), JSON.stringify(image ? [image] : []), JSON.stringify(dimensions), article, Boolean(image) && parentName !== 'Другое' && !isAccessory(name)],
    );
    await client.query(
      `INSERT INTO prices (product_id, supplier_id, price) VALUES ($1, $2, $3)
       ON CONFLICT (product_id, supplier_id) DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()`,
      [result.rows[0].id, supplierId, price],
    );
    if (existing.rowCount) updated += 1; else created += 1;
  }

  await client.query(`UPDATE import_runs SET status = 'success', created_count = $1, updated_count = $2, finished_at = NOW() WHERE id = $3`, [created, updated, runId]);
  console.log(`RealFlame import complete: created ${created}, updated ${updated}.`);
} catch (error) {
  if (runId) await client.query(`UPDATE import_runs SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`, [String(error.message || error), runId]);
  throw error;
} finally {
  await client.end();
}
