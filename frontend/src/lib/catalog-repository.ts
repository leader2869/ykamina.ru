import { Pool } from 'pg';
import { unstable_noStore as noStore } from 'next/cache';
import { Product, products as demoProducts } from '@/lib/products';
import { getDatabaseConnectionString } from '@/lib/database';

type DatabaseRow = {
  id: string | number;
  name: string;
  slug: string;
  description: string;
  price: string | number;
  old_price: string | number | null;
  images: unknown;
  stock: number;
  supplier_sku: string | null;
  dimensions: { width?: number; height?: number; depth?: number } | null;
  category_name: string | null;
  parent_category_name: string | null;
  availability: Product['availability'] | null;
  is_published?: boolean;
  visibility_comment?: string | null;
  specifications: Product['specifications'] | null;
};

export type CatalogCategory = { name: string; slug: string; children: { name: string; slug: string; count: number }[] };
export type HeaderCategoryPreview = { images: string[] };
export type CatalogSort = 'popular' | 'low' | 'high';
export type CatalogQuery = {
  category?: string;
  types?: string[];
  minPrice?: number;
  maxPrice?: number;
  width?: 'compact' | 'medium' | 'large';
  height?: 'compact' | 'medium' | 'large';
  sort?: CatalogSort;
  page?: number;
  pageSize?: number;
};
export type CatalogFacets = { priceRange: { min: number; max: number }; types: string[] };
export type CatalogPage = { data: Product[]; total: number; page: number; pageSize: number; facets?: CatalogFacets };

const globalForDatabase = global as typeof globalThis & { catalogPool?: Pool };
const databaseConnectionString = getDatabaseConnectionString();
const pool = databaseConnectionString
  ? (globalForDatabase.catalogPool ??= new Pool({ connectionString: databaseConnectionString, max: 2, idleTimeoutMillis: 10_000 }))
  : null;

function mapRow(row: DatabaseRow): Product {
  const images = Array.isArray(row.images) ? row.images.map(String) : [];
  const dimensions = row.dimensions || {};
  const dimensionValues = [dimensions.width, dimensions.height, dimensions.depth].filter(Boolean);
  return {
    id: String(row.id), name: row.name, slug: row.slug, description: row.description,
    price: Number(row.price), oldPrice: row.old_price === null ? undefined : Number(row.old_price),
    image: String(images[0] || 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=85'), images,
    type: row.category_name || 'Камин', parentType: row.parent_category_name || undefined, dimensions: dimensionValues.length ? `${dimensionValues.join(' × ')} мм` : 'Уточняйте у менеджера',
    stock: row.stock, article: row.supplier_sku || undefined, dimensionsData: dimensions,
    availability: row.availability || undefined, specifications: row.specifications || undefined,
    isPublished: row.is_published, visibilityComment: row.visibility_comment,
  };
}

function dimensionCondition(column: 'width' | 'height', range: CatalogQuery['width']) {
  const value = `(p.dimensions->>'${column}')::numeric`;
  if (range === 'compact') return `${value} < 600`;
  if (range === 'medium') return `${value} >= 600 AND ${value} < 1000`;
  if (range === 'large') return `${value} >= 1000`;
  return '';
}

function catalogWhere(query: CatalogQuery) {
  const conditions = ['p.is_published = TRUE'];
  const values: unknown[] = [];
  const add = (condition: string, value: unknown) => {
    values.push(value);
    conditions.push(condition.replace('?', `$${values.length}`));
  };
  if (query.category) {
    values.push(query.category, query.category);
    conditions.push(`(c.slug = $${values.length - 1} OR parent.slug = $${values.length})`);
  }
  if (query.types?.length) add('c.name = ANY(?::text[])', query.types);
  if (query.minPrice) add('p.price >= ?', query.minPrice);
  if (query.maxPrice) add('p.price <= ?', query.maxPrice);
  const width = dimensionCondition('width', query.width);
  const height = dimensionCondition('height', query.height);
  if (width) conditions.push(width);
  if (height) conditions.push(height);
  return { sql: conditions.join(' AND '), values };
}

function leanMapRow(row: DatabaseRow): Product {
  const product = mapRow(row);
  return { ...product, description: '', dimensions: '', specifications: undefined, availability: undefined };
}

export async function getCatalogPage(query: CatalogQuery = {}, includeFacets = false): Promise<CatalogPage> {
  const page = Math.max(1, Math.floor(query.page || 1));
  const pageSize = Math.min(48, Math.max(1, Math.floor(query.pageSize || 24)));
  if (!pool) {
    const sorted = [...demoProducts].sort((left, right) => query.sort === 'low' ? left.price - right.price : query.sort === 'high' ? right.price - left.price : left.name.localeCompare(right.name, 'ru'));
    return { data: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length, page, pageSize, facets: includeFacets ? { priceRange: { min: Math.min(...sorted.map((product) => product.price)), max: Math.max(...sorted.map((product) => product.price)) }, types: Array.from(new Set(sorted.map((product) => product.type))) } : undefined };
  }
  const where = catalogWhere(query);
  const order = query.sort === 'low' ? 'p.price ASC, p.name ASC' : query.sort === 'high' ? 'p.price DESC, p.name ASC' : `
    CASE WHEN p.images->>0 LIKE '/media/realflame/%' THEN 0 ELSE 1 END,
    CASE
      WHEN LOWER(COALESCE(p.availability->>'moscow', '')) = 'много' OR LOWER(COALESCE(p.availability->>'saintPetersburg', '')) = 'много' THEN 0
      WHEN LOWER(COALESCE(p.availability->>'moscow', '')) = 'мало' OR LOWER(COALESCE(p.availability->>'saintPetersburg', '')) = 'мало' THEN 1
      ELSE 2
    END,
    p.name ASC`;
  const offset = (page - 1) * pageSize;
  try {
    const values = [...where.values, pageSize, offset];
    const result = await pool.query<DatabaseRow & { total_count: string }>(
      `SELECT p.id, p.name, p.slug, '' AS description, p.price, p.old_price,
              CASE WHEN COALESCE(jsonb_array_length(p.images), 0) > 0 THEN jsonb_build_array(p.images->0) ELSE '[]'::jsonb END AS images,
              p.stock, NULL::text AS supplier_sku, '{}'::jsonb AS dimensions, NULL::jsonb AS availability,
              NULL::jsonb AS specifications, c.name AS category_name, parent.name AS parent_category_name,
              COUNT(*) OVER() AS total_count
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN categories parent ON parent.id = c.parent_id
       WHERE ${where.sql}
       ORDER BY ${order}
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    let facets: CatalogFacets | undefined;
    if (includeFacets) {
      const facetWhere = catalogWhere({ category: query.category });
      const facetResult = await pool.query<{ min_price: string | null; max_price: string | null; types: string[] | null }>(
        `SELECT MIN(p.price) AS min_price, MAX(p.price) AS max_price,
                ARRAY_AGG(DISTINCT c.name ORDER BY c.name) FILTER (WHERE c.name IS NOT NULL) AS types
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN categories parent ON parent.id = c.parent_id
         WHERE ${facetWhere.sql}`,
        facetWhere.values,
      );
      const row = facetResult.rows[0];
      facets = { priceRange: { min: Number(row?.min_price || 0), max: Number(row?.max_price || 0) }, types: row?.types || [] };
    }
    return { data: result.rows.map(leanMapRow), total: Number(result.rows[0]?.total_count || 0), page, pageSize, facets };
  } catch (error) {
    console.error('Catalog page database fallback:', error);
    return { data: [], total: 0, page, pageSize, facets: includeFacets ? { priceRange: { min: 0, max: 0 }, types: [] } : undefined };
  }
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const cleanIds = Array.from(new Set(ids.filter((id) => /^\d+$/.test(id)))).slice(0, 50);
  if (!cleanIds.length) return [];
  if (!pool) return demoProducts.filter((product) => cleanIds.includes(product.id));
  try {
    const result = await pool.query<DatabaseRow>(
      `SELECT p.id, p.name, p.slug, '' AS description, p.price, p.old_price,
              CASE WHEN COALESCE(jsonb_array_length(p.images), 0) > 0 THEN jsonb_build_array(p.images->0) ELSE '[]'::jsonb END AS images,
              p.stock, p.supplier_sku, '{}'::jsonb AS dimensions, NULL::jsonb AS availability,
              NULL::jsonb AS specifications, c.name AS category_name, parent.name AS parent_category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN categories parent ON parent.id = c.parent_id
       WHERE p.is_published = TRUE AND p.id = ANY($1::bigint[])`,
      [cleanIds],
    );
    return result.rows.map(leanMapRow);
  } catch (error) {
    console.error('Product selection database fallback:', error);
    return [];
  }
}

async function queryProducts(categorySlug?: string): Promise<Product[] | null> {
  if (!pool) return null;
  try {
    const result = await pool.query<DatabaseRow>(
      `SELECT p.id, p.name, p.slug, p.description, p.price, p.old_price, p.images, p.stock, p.supplier_sku,
              p.dimensions, p.availability, p.specifications, c.name AS category_name, parent.name AS parent_category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN categories parent ON parent.id = c.parent_id
       WHERE p.is_published = TRUE
       ${categorySlug ? 'AND (c.slug = $1 OR parent.slug = $1)' : ''}
       ORDER BY
         CASE
           WHEN LOWER(COALESCE(p.availability->>'moscow', '')) = 'много'
             OR LOWER(COALESCE(p.availability->>'saintPetersburg', '')) = 'много' THEN 0
           WHEN LOWER(COALESCE(p.availability->>'moscow', '')) = 'мало'
             OR LOWER(COALESCE(p.availability->>'saintPetersburg', '')) = 'мало' THEN 1
           WHEN BTRIM(COALESCE(p.description, '')) <> ''
             AND (COALESCE(p.dimensions, '{}'::jsonb) <> '{}'::jsonb
               OR COALESCE(p.specifications, '{}'::jsonb) NOT IN ('{}'::jsonb, '[]'::jsonb, 'null'::jsonb)) THEN 2
           ELSE 3
         END,
         p.name ASC`,
      categorySlug ? [categorySlug] : [],
    );
    return result.rows.map(mapRow);
  } catch (error) {
    console.error('Catalog database fallback:', error);
    return null;
  }
}

export async function getProducts(categorySlug?: string) {
  const data = await queryProducts(categorySlug);
  return data || (categorySlug ? [] : demoProducts);
}

export async function getSaleProducts() {
  if (!pool) return demoProducts.filter((product) => product.oldPrice && product.oldPrice > product.price);
  try {
    const result = await pool.query<DatabaseRow>(
      `SELECT p.id, p.name, p.slug, p.description, p.price, p.old_price, p.images, p.stock, p.supplier_sku,
              p.dimensions, p.availability, p.specifications, p.is_published, p.visibility_comment,
              c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.is_published = TRUE AND p.old_price > p.price
       ORDER BY ((p.old_price - p.price) / p.old_price) DESC, p.updated_at DESC`,
    );
    return result.rows.map(mapRow);
  } catch (error) {
    console.error('Sales database fallback:', error);
    return demoProducts.filter((product) => product.oldPrice && product.oldPrice > product.price);
  }
}

export async function getHeaderCategoryPreviews(): Promise<Record<string, HeaderCategoryPreview>> {
  noStore();
  if (!pool) return {};
  try {
    const result = await pool.query<{ category_slug: string; images: unknown }>(
      `SELECT category_slug, images FROM (
         SELECT c.slug AS category_slug, p.images,
                ROW_NUMBER() OVER (PARTITION BY c.slug ORDER BY RANDOM()) AS row_number
         FROM products p
         JOIN categories c ON c.id = p.category_id
         JOIN categories parent ON parent.id = c.parent_id
         WHERE p.is_published = TRUE
           AND parent.slug = ANY($1::text[])
           AND COALESCE(jsonb_array_length(p.images), 0) > 0
           AND p.images->>0 LIKE '/media/realflame/%'
       ) previews
       WHERE row_number <= 6
       ORDER BY category_slug, row_number`,
      [['электрокамины', 'электроочаги', 'порталы', 'биокамины']],
    );
    return result.rows.reduce<Record<string, HeaderCategoryPreview>>((previews, row) => {
      const images = Array.isArray(row.images) ? row.images.map(String) : [];
      const category = previews[row.category_slug] ??= { images: [] };
      if (images[0]) category.images.push(images[0]);
      return previews;
    }, {});
  } catch {
    return {};
  }
}

export async function getProduct(idOrSlug: string, includeUnpublished = false) {
  if (!pool) return demoProducts.find((product) => product.id === idOrSlug || product.slug === idOrSlug);
  try {
    const result = await pool.query<DatabaseRow>(
      `SELECT p.id, p.name, p.slug, p.description, p.price, p.old_price, p.images, p.stock, p.supplier_sku,
              p.dimensions, p.availability, p.specifications, p.is_published, p.visibility_comment,
              c.name AS category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE ($2::boolean = TRUE OR p.is_published = TRUE)
         AND (p.id::text = $1 OR p.slug = $1) LIMIT 1`, [idOrSlug, includeUnpublished],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  } catch (error) {
    console.error('Catalog database fallback:', error);
    return demoProducts.find((product) => product.id === idOrSlug || product.slug === idOrSlug);
  }
}

export async function getCompatibleProducts(productId: string): Promise<{ title: string; products: Product[] } | null> {
  if (!pool) return null;
  const productFields = `p.id, p.name, p.slug, p.description, p.price, p.old_price, p.images, p.stock, p.supplier_sku,
                         p.dimensions, p.availability, p.specifications, c.name AS category_name`;
  try {
    const portals = await pool.query<DatabaseRow>(
      `SELECT ${productFields} FROM product_compatibilities pc
       JOIN products p ON p.id = pc.portal_product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE pc.hearth_product_id = $1 AND p.is_published = TRUE
       ORDER BY p.price ASC LIMIT 12`, [productId],
    );
    if (portals.rowCount) return { title: 'Подходящие порталы', products: portals.rows.map(mapRow) };
    const hearths = await pool.query<DatabaseRow>(
      `SELECT ${productFields} FROM product_compatibilities pc
       JOIN products p ON p.id = pc.hearth_product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE pc.portal_product_id = $1 AND p.is_published = TRUE
       ORDER BY p.price ASC LIMIT 12`, [productId],
    );
    return hearths.rowCount ? { title: 'Подходящие электроочаги', products: hearths.rows.map(mapRow) } : null;
  } catch (error) {
    console.error('Compatibility database fallback:', error);
    return null;
  }
}

export async function getCategories(): Promise<CatalogCategory[]> {
  if (!pool) return [];
  try {
    const result = await pool.query<{ parent_name: string; parent_slug: string; name: string; slug: string; count: string }>(
      `SELECT parent.name AS parent_name, parent.slug AS parent_slug, c.name, c.slug, COUNT(p.id) AS count
       FROM categories c JOIN categories parent ON parent.id = c.parent_id
       JOIN products p ON p.category_id = c.id AND p.is_published = TRUE
       GROUP BY parent.id, c.id
       ORDER BY CASE parent.slug
         WHEN 'электрокамины' THEN 1
         WHEN 'электроочаги' THEN 2
         WHEN 'порталы' THEN 3
         WHEN 'биокамины' THEN 4
         ELSE 99
       END, c.name`,
    );
    return Object.values(result.rows.reduce<Record<string, CatalogCategory>>((groups, row) => {
      const group = groups[row.parent_slug] ??= { name: row.parent_name, slug: row.parent_slug, children: [] };
      group.children.push({ name: row.name, slug: row.slug, count: Number(row.count) });
      return groups;
    }, {}));
  } catch { return []; }
}
