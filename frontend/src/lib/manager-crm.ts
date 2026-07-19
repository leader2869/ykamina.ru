import { Pool } from 'pg';
import { getDatabaseConnectionString } from '@/lib/database';

const globalForCrm = global as typeof globalThis & { managerCrmPool?: Pool };
const connectionString = getDatabaseConnectionString();
const pool = connectionString
  ? (globalForCrm.managerCrmPool ??= new Pool({ connectionString, max: 2, idleTimeoutMillis: 10_000 }))
  : null;

function database() {
  if (!pool) throw new Error('CRM не подключена к базе данных');
  return pool;
}

export type SalesClient = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  source: string;
  status: string;
  notes: string | null;
  lastContactAt: string | null;
  nextContactAt: string | null;
  createdAt: string;
  updatedAt: string;
  dealsCount: number;
  dealsAmountKopecks: number;
};

export type SalesDeal = {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  title: string;
  stage: string;
  amountKopecks: number;
  purchaseCostKopecks: number | null;
  probability: number;
  productInterest: string | null;
  notes: string | null;
  expectedCloseDate: string | null;
  nextContactAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SalesTask = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  title: string;
  description: string | null;
  dueAt: string;
  priority: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
};

export type SalesActivity = {
  id: string;
  action: string;
  description: string;
  clientName: string | null;
  dealTitle: string | null;
  createdAt: string;
};

export type ManagerWorkspace = {
  clients: SalesClient[];
  deals: SalesDeal[];
  tasks: SalesTask[];
  activities: SalesActivity[];
};

const iso = (value: Date | string | null) => value ? new Date(value).toISOString() : null;

export async function getManagerWorkspace(managerUserId: string): Promise<ManagerWorkspace> {
  await database().query(
    `UPDATE sales_deals d
     SET stage='won', probability=100, closed_at=COALESCE(d.closed_at, NOW()), updated_at=NOW()
     FROM payment_orders o
     WHERE o.sales_deal_id=d.id AND o.manager_user_id=$1 AND o.status='confirmed' AND d.stage<>'won'`,
    [managerUserId],
  );
  const purchaseCostColumn = await database().query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='sales_deals' AND column_name='purchase_cost_kopecks'
    ) AS exists`,
  );
  const purchaseCostSelect = purchaseCostColumn.rows[0]?.exists
    ? 'd.purchase_cost_kopecks'
    : 'NULL::bigint AS purchase_cost_kopecks';
  const [clientsResult, dealsResult, tasksResult, activitiesResult] = await Promise.all([
    database().query<{
      id: string; full_name: string; phone: string | null; email: string | null; city: string | null;
      source: string; status: string; notes: string | null; last_contact_at: Date | null;
      next_contact_at: Date | null; created_at: Date; updated_at: Date; deals_count: string;
      deals_amount: string;
    }>(
      `SELECT c.id, c.full_name, c.phone, c.email, c.city, c.source, c.status, c.notes,
        c.last_contact_at, c.next_contact_at, c.created_at, c.updated_at,
        COUNT(d.id) AS deals_count, COALESCE(SUM(d.amount_kopecks), 0) AS deals_amount
       FROM sales_clients c
       LEFT JOIN sales_deals d ON d.client_id = c.id
       WHERE c.manager_user_id = $1
       GROUP BY c.id ORDER BY c.updated_at DESC`,
      [managerUserId],
    ),
    database().query<{
      id: string; client_id: string; client_name: string; client_phone: string | null;
      title: string; stage: string; amount_kopecks: string; purchase_cost_kopecks: string | null; probability: number;
      product_interest: string | null; notes: string | null; expected_close_date: string | null;
      next_contact_at: Date | null; created_at: Date; updated_at: Date;
    }>(
      `SELECT d.id, d.client_id, c.full_name AS client_name, c.phone AS client_phone,
        d.title, d.stage, d.amount_kopecks, ${purchaseCostSelect}, d.probability, d.product_interest, d.notes,
        d.expected_close_date, d.next_contact_at, d.created_at, d.updated_at
       FROM sales_deals d JOIN sales_clients c ON c.id = d.client_id
       WHERE d.manager_user_id = $1 ORDER BY d.updated_at DESC`,
      [managerUserId],
    ),
    database().query<{
      id: string; client_id: string | null; client_name: string | null; deal_id: string | null;
      deal_title: string | null; title: string; description: string | null; due_at: Date;
      priority: string; status: string; completed_at: Date | null; created_at: Date;
    }>(
      `SELECT t.id, t.client_id, c.full_name AS client_name, t.deal_id, d.title AS deal_title,
        t.title, t.description, t.due_at, t.priority, t.status, t.completed_at, t.created_at
       FROM sales_tasks t
       LEFT JOIN sales_clients c ON c.id = t.client_id
       LEFT JOIN sales_deals d ON d.id = t.deal_id
       WHERE t.manager_user_id = $1
       ORDER BY CASE WHEN t.status = 'open' THEN 0 ELSE 1 END, t.due_at, t.created_at DESC`,
      [managerUserId],
    ),
    database().query<{
      id: string; action: string; description: string; client_name: string | null;
      deal_title: string | null; created_at: Date;
    }>(
      `SELECT a.id, a.action, a.description, c.full_name AS client_name, d.title AS deal_title,
        a.created_at
       FROM sales_activities a
       LEFT JOIN sales_clients c ON c.id = a.client_id
       LEFT JOIN sales_deals d ON d.id = a.deal_id
       WHERE a.manager_user_id = $1 ORDER BY a.created_at DESC LIMIT 30`,
      [managerUserId],
    ),
  ]);

  return {
    clients: clientsResult.rows.map((row) => ({
      id: String(row.id), fullName: row.full_name, phone: row.phone, email: row.email,
      city: row.city, source: row.source, status: row.status, notes: row.notes,
      lastContactAt: iso(row.last_contact_at), nextContactAt: iso(row.next_contact_at),
      createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)!,
      dealsCount: Number(row.deals_count), dealsAmountKopecks: Number(row.deals_amount),
    })),
    deals: dealsResult.rows.map((row) => ({
      id: String(row.id), clientId: String(row.client_id), clientName: row.client_name,
      clientPhone: row.client_phone, title: row.title, stage: row.stage,
      amountKopecks: Number(row.amount_kopecks),
      purchaseCostKopecks: row.purchase_cost_kopecks === null ? null : Number(row.purchase_cost_kopecks),
      probability: row.probability,
      productInterest: row.product_interest, notes: row.notes,
      expectedCloseDate: row.expected_close_date, nextContactAt: iso(row.next_contact_at),
      createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)!,
    })),
    tasks: tasksResult.rows.map((row) => ({
      id: String(row.id), clientId: row.client_id ? String(row.client_id) : null,
      clientName: row.client_name, dealId: row.deal_id ? String(row.deal_id) : null,
      dealTitle: row.deal_title, title: row.title, description: row.description,
      dueAt: iso(row.due_at)!, priority: row.priority, status: row.status,
      completedAt: iso(row.completed_at), createdAt: iso(row.created_at)!,
    })),
    activities: activitiesResult.rows.map((row) => ({
      id: String(row.id), action: row.action, description: row.description,
      clientName: row.client_name, dealTitle: row.deal_title, createdAt: iso(row.created_at)!,
    })),
  };
}

export function getManagerCrmPool() {
  return database();
}
