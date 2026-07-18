import { Pool } from 'pg';
import { unstable_noStore as noStore } from 'next/cache';
import { Product, products as demoProducts } from '@/lib/products';

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
  specifications: Product['specifications'] | null;
};

export type CatalogCategory = { name: string; slug: string; children: { name: string; slug: string; count: number }[] };
export type HeaderCategoryPreview = { images: string[] };

const globalForDatabase = global as typeof globalThis & { catalogPool?: Pool };
const pool = process.env.DATABASE_URL
  ? (globalForDatabase.catalogPool ??= new Pool({ connectionString: process.env.DATABASE_URL }))
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
  };
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
       ORDER BY p.updated_at DESC`,
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
              p.dimensions, p.availability, p.specifications, c.name AS category_name
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

export async function getProduct(idOrSlug: string) {
  if (!pool) return demoProducts.find((product) => product.id === idOrSlug || product.slug === idOrSlug);
  try {
    const result = await pool.query<DatabaseRow>(
      `SELECT p.id, p.name, p.slug, p.description, p.price, p.old_price, p.images, p.stock, p.supplier_sku,
              p.dimensions, p.availability, p.specifications, c.name AS category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.is_published = TRUE AND (p.id::text = $1 OR p.slug = $1) LIMIT 1`, [idOrSlug],
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
