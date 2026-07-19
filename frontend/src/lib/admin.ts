import { unstable_noStore as noStore } from 'next/cache';
import { Pool } from 'pg';
import { products as demoProducts } from '@/lib/products';

export type AdminProduct = {
  id: string;
  name: string;
  sku: string;
  categoryId: string | null;
  category: string;
  categorySlug: string | null;
  parentCategory: string | null;
  image: string | null;
  price: number;
  stock: number;
  availability: {
    moscow?: string | null;
    saintPetersburg?: string | null;
    wholesalePrice?: number | null;
    recommendedRetailPrice?: number | null;
  } | null;
  isPublished: boolean;
  visibilityComment: string | null;
  updatedAt: string;
};

export type AdminProductDetails = AdminProduct & {
  description: string;
  oldPrice: number | null;
  images: string[];
  dimensions: { width?: number; height?: number; depth?: number };
  weight: number | null;
};

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  parentName: string | null;
  parentSlug: string | null;
  productCount: number;
  publishedCount: number;
};

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  role: 'customer' | 'sales_manager' | 'super_admin';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type ImportRun = {
  id: string;
  supplier: string;
  status: 'running' | 'success' | 'failed';
  createdCount: number;
  updatedCount: number;
  startedAt: string;
  errorMessage: string | null;
};

export type AuditEvent = {
  id: string;
  actorUserId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityLabel: string;
  createdAt: string;
};

export type AdminDashboard = {
  databaseConnected: boolean;
  metrics: {
    products: number;
    published: number;
    outOfStock: number;
    catalogValue: number;
    users: number;
    managers: number;
  };
  products: AdminProduct[];
  categories: AdminCategory[];
  users: AdminUser[];
  imports: ImportRun[];
  audit: AuditEvent[];
};

const globalForAdmin = global as typeof globalThis & { adminPool?: Pool };
const pool = process.env.DATABASE_URL
  ? (globalForAdmin.adminPool ??= new Pool({ connectionString: process.env.DATABASE_URL }))
  : null;

export function getAdminPool() {
  if (!pool) throw new Error('База данных недоступна');
  return pool;
}

export async function getAdminProduct(productId: string): Promise<AdminProductDetails | null> {
  noStore();
  if (!pool || !/^\d+$/.test(productId)) return null;
  const result = await pool.query<{
    id: string; name: string; supplier_sku: string | null; category_id: string | null;
    category: string | null; category_slug: string | null; parent_category: string | null;
    description: string; price: string; old_price: string | null; images: unknown;
    stock: number; availability: AdminProduct['availability']; dimensions: AdminProductDetails['dimensions'] | null; weight: string | null;
    is_published: boolean; visibility_comment: string | null; updated_at: string;
  }>(`SELECT p.id, p.name, p.supplier_sku, p.category_id, c.name AS category,
      c.slug AS category_slug, parent.name AS parent_category, p.description, p.price,
      p.old_price, p.images, p.stock, p.availability, p.dimensions, p.weight, p.is_published,
      p.visibility_comment, p.updated_at
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN categories parent ON parent.id = c.parent_id
    WHERE p.id = $1 LIMIT 1`, [productId]);
  const row = result.rows[0];
  if (!row) return null;
  const images = Array.isArray(row.images) ? row.images.map(String) : [];
  return {
    id: String(row.id), name: row.name, sku: row.supplier_sku || '',
    categoryId: row.category_id ? String(row.category_id) : null,
    category: row.category || 'Без категории', categorySlug: row.category_slug,
    parentCategory: row.parent_category, image: images[0] || null, description: row.description, price: Number(row.price),
    oldPrice: row.old_price === null ? null : Number(row.old_price),
    images, stock: row.stock, availability: row.availability,
    dimensions: row.dimensions || {}, weight: row.weight === null ? null : Number(row.weight),
    isPublished: row.is_published, visibilityComment: row.visibility_comment, updatedAt: row.updated_at,
  };
}

const demoDashboard = (): AdminDashboard => ({
  databaseConnected: false,
  metrics: {
    products: demoProducts.length,
    published: demoProducts.length,
    outOfStock: demoProducts.filter((product) => product.stock === 0).length,
    catalogValue: demoProducts.reduce((sum, product) => sum + product.price * product.stock, 0),
    users: 0,
    managers: 0,
  },
  products: demoProducts.slice(0, 12).map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.article || '—',
    categoryId: null,
    category: product.type,
    categorySlug: null,
    parentCategory: product.parentType || null,
    image: product.image || null,
    price: product.price,
    stock: product.stock,
    availability: null,
    isPublished: true,
    visibilityComment: null,
    updatedAt: new Date().toISOString(),
  })),
  categories: [],
  users: [],
  imports: [],
  audit: [],
});

export async function getAdminDashboard(filters: { category?: string; query?: string } = {}): Promise<AdminDashboard> {
  noStore();
  if (!pool) return demoDashboard();

  try {
    const category = filters.category?.trim() || null;
    const query = filters.query?.trim() || null;
    const [metricsResult, productsResult, categoriesResult, usersResult, importsResult] = await Promise.all([
      pool.query<{
        products: string; published: string; out_of_stock: string; catalog_value: string;
        users: string; managers: string;
      }>(`SELECT
        (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM products WHERE is_published = TRUE) AS published,
        (SELECT COUNT(*) FROM products WHERE stock = 0) AS out_of_stock,
        (SELECT COALESCE(SUM(price * stock), 0) FROM products) AS catalog_value,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM users WHERE role IN ('sales_manager', 'super_admin')) AS managers`),
      pool.query<{
        id: string; name: string; supplier_sku: string | null; category_id: string | null;
        category: string | null; category_slug: string | null; parent_category: string | null;
        price: string; images: unknown; stock: number; availability: AdminProduct['availability']; is_published: boolean;
        visibility_comment: string | null; updated_at: string;
      }>(`SELECT p.id, p.name, p.supplier_sku, p.category_id, c.name AS category,
          c.slug AS category_slug, parent.name AS parent_category, p.images, p.price, p.stock, p.availability,
          p.is_published, p.visibility_comment, p.updated_at
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN categories parent ON parent.id = c.parent_id
        WHERE ($1::text IS NULL OR c.slug = $1 OR parent.slug = $1)
          AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%'
            OR COALESCE(p.supplier_sku, '') ILIKE '%' || $2 || '%'
            OR COALESCE(c.name, '') ILIKE '%' || $2 || '%')
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
          CASE WHEN p.is_published THEN 0 ELSE 1 END,
          p.name ASC
        LIMIT 250`, [category, query]),
      pool.query<{
        id: string; name: string; slug: string; parent_id: string | null;
        parent_name: string | null; parent_slug: string | null;
        product_count: string; published_count: string;
      }>(`SELECT c.id, c.name, c.slug, c.parent_id, parent.name AS parent_name,
          parent.slug AS parent_slug, COUNT(p.id) AS product_count,
          COUNT(p.id) FILTER (WHERE p.is_published = TRUE) AS published_count
        FROM categories c
        LEFT JOIN categories parent ON parent.id = c.parent_id
        LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id, parent.id
        ORDER BY CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END, c.name`),
      pool.query<{
        id: string; full_name: string; email: string; role: AdminUser['role'];
        is_active: boolean; last_login_at: string | null; created_at: string;
      }>(`SELECT id, full_name, email, role, is_active,
          (SELECT MAX(s.created_at) FROM user_sessions s WHERE s.user_id = users.id) AS last_login_at,
          created_at
        FROM users ORDER BY created_at DESC LIMIT 50`),
      pool.query<{
        id: string; supplier: string | null; status: ImportRun['status']; created_count: number;
        updated_count: number; started_at: string; error_message: string | null;
      }>(`SELECT r.id, s.name AS supplier, r.status, r.created_count, r.updated_count,
          r.started_at, r.error_message
        FROM import_runs r LEFT JOIN suppliers s ON s.id = r.supplier_id
        ORDER BY r.started_at DESC LIMIT 12`),
    ]);

    let audit: AuditEvent[] = [];
    try {
      const auditResult = await pool.query<{
        id: string; actor_user_id: string | null; actor_name: string | null; action: string; entity_type: string;
        entity_label: string; created_at: string;
      }>(`SELECT a.id, a.actor_user_id, u.full_name AS actor_name, a.action, a.entity_type,
          a.entity_label, a.created_at
        FROM admin_audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC LIMIT 100`);
      audit = auditResult.rows.map((row) => ({
        id: String(row.id), actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
        actorName: row.actor_name || 'Система', action: row.action,
        entityType: row.entity_type, entityLabel: row.entity_label, createdAt: row.created_at,
      }));
    } catch {
      // The dashboard remains available while migration 009 is being applied.
    }

    const metrics = metricsResult.rows[0];
    return {
      databaseConnected: true,
      metrics: {
        products: Number(metrics.products), published: Number(metrics.published),
        outOfStock: Number(metrics.out_of_stock), catalogValue: Number(metrics.catalog_value),
        users: Number(metrics.users), managers: Number(metrics.managers),
      },
      products: productsResult.rows.map((row) => ({
        id: String(row.id), name: row.name, sku: row.supplier_sku || '—',
        categoryId: row.category_id ? String(row.category_id) : null,
        category: row.category || 'Без категории', categorySlug: row.category_slug,
        parentCategory: row.parent_category,
        image: Array.isArray(row.images) && row.images.length ? String(row.images[0]) : null,
        price: Number(row.price), stock: row.stock, availability: row.availability,
        isPublished: row.is_published, visibilityComment: row.visibility_comment, updatedAt: row.updated_at,
      })),
      categories: categoriesResult.rows.map((row) => ({
        id: String(row.id), name: row.name, slug: row.slug,
        parentId: row.parent_id ? String(row.parent_id) : null,
        parentName: row.parent_name, parentSlug: row.parent_slug,
        productCount: Number(row.product_count), publishedCount: Number(row.published_count),
      })),
      users: usersResult.rows.map((row) => ({
        id: String(row.id), fullName: row.full_name, email: row.email, role: row.role,
        isActive: row.is_active, lastLoginAt: row.last_login_at, createdAt: row.created_at,
      })),
      imports: importsResult.rows.map((row) => ({
        id: String(row.id), supplier: row.supplier || 'Неизвестный поставщик', status: row.status,
        createdCount: row.created_count, updatedCount: row.updated_count,
        startedAt: row.started_at, errorMessage: row.error_message,
      })),
      audit,
    };
  } catch (error) {
    console.error('Admin dashboard database fallback:', error);
    return demoDashboard();
  }
}
