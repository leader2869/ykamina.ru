import { unstable_noStore as noStore } from 'next/cache';
import { Pool } from 'pg';
import { products as demoProducts } from '@/lib/products';

export type AdminProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  isPublished: boolean;
  updatedAt: string;
};

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  role: 'customer' | 'sales_manager' | 'super_admin';
  isActive: boolean;
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
    category: product.type,
    price: product.price,
    stock: product.stock,
    isPublished: true,
    updatedAt: new Date().toISOString(),
  })),
  users: [],
  imports: [],
  audit: [],
});

export async function getAdminDashboard(): Promise<AdminDashboard> {
  noStore();
  if (!pool) return demoDashboard();

  try {
    const [metricsResult, productsResult, usersResult, importsResult] = await Promise.all([
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
        id: string; name: string; supplier_sku: string | null; category: string | null;
        price: string; stock: number; is_published: boolean; updated_at: string;
      }>(`SELECT p.id, p.name, p.supplier_sku, c.name AS category, p.price, p.stock,
          p.is_published, p.updated_at
        FROM products p LEFT JOIN categories c ON c.id = p.category_id
        ORDER BY p.updated_at DESC LIMIT 50`),
      pool.query<{
        id: string; full_name: string; email: string; role: AdminUser['role'];
        is_active: boolean; created_at: string;
      }>(`SELECT id, full_name, email, role, is_active, created_at
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
        id: string; actor_name: string | null; action: string; entity_type: string;
        entity_label: string; created_at: string;
      }>(`SELECT a.id, u.full_name AS actor_name, a.action, a.entity_type,
          a.entity_label, a.created_at
        FROM admin_audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC LIMIT 20`);
      audit = auditResult.rows.map((row) => ({
        id: String(row.id), actorName: row.actor_name || 'Система', action: row.action,
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
        category: row.category || 'Без категории', price: Number(row.price), stock: row.stock,
        isPublished: row.is_published, updatedAt: row.updated_at,
      })),
      users: usersResult.rows.map((row) => ({
        id: String(row.id), fullName: row.full_name, email: row.email, role: row.role,
        isActive: row.is_active, createdAt: row.created_at,
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
