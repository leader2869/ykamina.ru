import { Pool } from 'pg';
import { getDatabaseConnectionString } from '@/lib/database';
import type { TBankReceipt } from '@/lib/tbank-receipt';

const globalForPayments = global as typeof globalThis & { paymentOrdersPool?: Pool };
const databaseConnectionString = getDatabaseConnectionString();
const pool = databaseConnectionString
  ? (globalForPayments.paymentOrdersPool ??= new Pool({
      connectionString: databaseConnectionString,
    }))
  : null;

export type StoredOrderItem = {
  productId: string;
  name: string;
  priceKopecks: number;
  quantity: number;
};

export type PaymentOrder = {
  id: string;
  orderNumber: string | null;
  status: string;
  amountKopecks: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryCity: string;
  comment: string | null;
  items: StoredOrderItem[];
  paymentId: string | null;
  paymentProvider: 'tbank' | 'yandex_split';
  cancellationReason: string | null;
  createdAt: string;
  cancelledAt: string | null;
  source: 'website' | 'manager';
  managerUserId: string | null;
  managerName: string | null;
  paymentUrl: string | null;
  paidAt: string | null;
};

export type SalesAnalytics = {
  orders: number;
  paidOrders: number;
  revenueKopecks: number;
  averageCheckKopecks: number;
  awaitingPayment: number;
  website: { orders: number; paidOrders: number; revenueKopecks: number };
  manager: { orders: number; paidOrders: number; revenueKopecks: number };
  managers: {
    id: string;
    name: string;
    orders: number;
    paidOrders: number;
    revenueKopecks: number;
  }[];
};

function database() {
  if (!pool) throw new Error('Хранилище заказов не настроено');
  return pool;
}

export async function createPaymentOrder(order: {
  id: string;
  amountKopecks: number;
  name: string;
  email: string;
  phone: string;
  city: string;
  comment: string;
  items: StoredOrderItem[];
  receipt: TBankReceipt;
  source?: 'website' | 'manager';
  managerUserId?: string | null;
  paymentProvider?: 'tbank' | 'yandex_split';
}) {
  await database().query(
    `INSERT INTO payment_orders
      (id, amount_kopecks, customer_name, customer_email, customer_phone, delivery_city, customer_comment, items, receipt, source, manager_user_id, payment_provider)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)`,
    [
      order.id,
      order.amountKopecks,
      order.name,
      order.email,
      order.phone,
      order.city,
      order.comment || null,
      JSON.stringify(order.items),
      JSON.stringify(order.receipt),
      order.source || 'website',
      order.managerUserId || null,
      order.paymentProvider || 'tbank',
    ],
  );
}

export async function markPaymentInitialized(
  orderId: string,
  paymentId: string | null,
  paymentUrl?: string,
) {
  await database().query(
    `UPDATE payment_orders SET status = 'payment_initialized',
       tbank_payment_id = COALESCE(NULLIF($2::varchar, ''), tbank_payment_id),
       payment_url = COALESCE($3, payment_url), updated_at = NOW() WHERE id = $1::uuid`,
    [orderId, paymentId || null, paymentUrl || null],
  );
}

export async function markPaymentInitFailed(orderId: string) {
  await database().query(
    `UPDATE payment_orders SET status = 'payment_init_failed', updated_at = NOW() WHERE id = $1::uuid`,
    [orderId],
  );
}

export async function applyPaymentNotification(
  orderId: string,
  status: string,
  payload: Record<string, unknown>,
) {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const normalizedStatus = status.toLowerCase();
    const paymentId = typeof payload.PaymentId === 'string'
      ? payload.PaymentId
      : payload.PaymentId == null ? null : String(payload.PaymentId);
    if (normalizedStatus === 'confirmed') {
      const paymentDay = await client.query<{ day: string }>(
        `SELECT TO_CHAR(NOW() AT TIME ZONE 'Europe/Moscow', 'DDMMYY') AS day`,
      );
      const day = paymentDay.rows[0].day;
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('payment-order-number'))`);
      await client.query(
        `WITH next_number AS (
           SELECT COALESCE(MAX(order_sequence), 0) + 1 AS value
           FROM payment_orders
         )
         UPDATE payment_orders
         SET status = $2::varchar, tbank_payment_id = COALESCE(tbank_payment_id, NULLIF($3::varchar, '')), bank_notification = $4::jsonb,
             updated_at = NOW(), paid_at = COALESCE(paid_at, NOW()),
             order_sequence = COALESCE(order_sequence, next_number.value),
             order_number = COALESCE(order_number, $5::text || '-' || LPAD(next_number.value::text, 3, '0'))
         FROM next_number WHERE id = $1::uuid`,
        [orderId, normalizedStatus, paymentId, JSON.stringify(payload), day],
      );
    } else {
      await client.query(
        `UPDATE payment_orders
         SET status = $2::varchar, tbank_payment_id = COALESCE(tbank_payment_id, NULLIF($3::varchar, '')), bank_notification = $4::jsonb, updated_at = NOW()
         WHERE id = $1::uuid`,
        [orderId, normalizedStatus, paymentId, JSON.stringify(payload)],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getPaymentOrderNumber(orderId: string): Promise<string | null> {
  if (!/^[0-9a-f]{32}$/i.test(orderId)) return null;
  const result = await database().query<{ order_number: string | null }>(
    `SELECT order_number FROM payment_orders WHERE id = $1::uuid LIMIT 1`,
    [orderId],
  );
  return result.rows[0]?.order_number || null;
}

export async function getPaymentOrderProvider(orderId: string): Promise<string | null> {
  if (!/^[0-9a-f]{32}$/i.test(orderId)) return null;
  const result = await database().query<{ payment_provider: string }>(
    `SELECT payment_provider FROM payment_orders WHERE id = $1::uuid LIMIT 1`,
    [orderId],
  );
  return result.rows[0]?.payment_provider || null;
}

export async function getPaymentOrders(
  limit = 100,
  managerUserId?: string,
): Promise<PaymentOrder[]> {
  const result = await database().query<{
    id: string;
    order_number: string | null;
    status: string;
    amount_kopecks: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    delivery_city: string;
    customer_comment: string | null;
    items: unknown;
    tbank_payment_id: string | null;
    cancellation_reason: string | null;
    created_at: string;
    cancelled_at: string | null;
    source: 'website' | 'manager';
    manager_user_id: string | null;
    manager_name: string | null;
    payment_url: string | null;
    paid_at: string | null;
    payment_provider: 'tbank' | 'yandex_split';
  }>(
    `SELECT o.id, order_number, status, amount_kopecks, customer_name, customer_email, customer_phone,
        delivery_city, customer_comment, items, tbank_payment_id, cancellation_reason, o.created_at, cancelled_at,
        source, manager_user_id, u.full_name AS manager_name, payment_url, paid_at, payment_provider
      FROM payment_orders o LEFT JOIN users u ON u.id = o.manager_user_id
      WHERE ($2::bigint IS NULL OR o.manager_user_id = $2)
      ORDER BY o.created_at DESC LIMIT $1`,
    [Math.min(250, Math.max(1, limit)), managerUserId || null],
  );
  return result.rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    amountKopecks: Number(row.amount_kopecks),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    deliveryCity: row.delivery_city,
    comment: row.customer_comment,
    items: Array.isArray(row.items) ? (row.items as StoredOrderItem[]) : [],
    paymentId: row.tbank_payment_id,
    paymentProvider: row.payment_provider,
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    source: row.source,
    managerUserId: row.manager_user_id ? String(row.manager_user_id) : null,
    managerName: row.manager_name,
    paymentUrl: row.payment_url,
    paidAt: row.paid_at,
  }));
}

export async function getSalesAnalytics(managerUserId?: string): Promise<SalesAnalytics> {
  const filter = managerUserId ? 'WHERE o.manager_user_id = $1' : '';
  const params = managerUserId ? [managerUserId] : [];
  const [totalsResult, managersResult] = await Promise.all([
    database().query<{
      orders: string;
      paid_orders: string;
      revenue: string;
      awaiting_payment: string;
      website_orders: string;
      website_paid: string;
      website_revenue: string;
      manager_orders: string;
      manager_paid: string;
      manager_revenue: string;
    }>(
      `SELECT COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE o.status = 'confirmed') AS paid_orders,
        COALESCE(SUM(o.amount_kopecks) FILTER (WHERE o.status = 'confirmed'), 0) AS revenue,
        COUNT(*) FILTER (WHERE o.status IN ('created', 'payment_initialized')) AS awaiting_payment,
        COUNT(*) FILTER (WHERE o.source = 'website') AS website_orders,
        COUNT(*) FILTER (WHERE o.source = 'website' AND o.status = 'confirmed') AS website_paid,
        COALESCE(SUM(o.amount_kopecks) FILTER (WHERE o.source = 'website' AND o.status = 'confirmed'), 0) AS website_revenue,
        COUNT(*) FILTER (WHERE o.source = 'manager') AS manager_orders,
        COUNT(*) FILTER (WHERE o.source = 'manager' AND o.status = 'confirmed') AS manager_paid,
        COALESCE(SUM(o.amount_kopecks) FILTER (WHERE o.source = 'manager' AND o.status = 'confirmed'), 0) AS manager_revenue
      FROM payment_orders o ${filter}`,
      params,
    ),
    database().query<{
      id: string;
      name: string;
      orders: string;
      paid_orders: string;
      revenue: string;
    }>(
      `SELECT u.id, u.full_name AS name,
        COUNT(o.id) AS orders, COUNT(o.id) FILTER (WHERE o.status = 'confirmed') AS paid_orders,
        COALESCE(SUM(o.amount_kopecks) FILTER (WHERE o.status = 'confirmed'), 0) AS revenue
      FROM payment_orders o JOIN users u ON u.id = o.manager_user_id
      ${filter} GROUP BY u.id ORDER BY revenue DESC`,
      params,
    ),
  ]);
  const row = totalsResult.rows[0];
  const paidOrders = Number(row.paid_orders);
  const revenueKopecks = Number(row.revenue);
  return {
    orders: Number(row.orders),
    paidOrders,
    revenueKopecks,
    averageCheckKopecks: paidOrders ? Math.round(revenueKopecks / paidOrders) : 0,
    awaitingPayment: Number(row.awaiting_payment),
    website: {
      orders: Number(row.website_orders),
      paidOrders: Number(row.website_paid),
      revenueKopecks: Number(row.website_revenue),
    },
    manager: {
      orders: Number(row.manager_orders),
      paidOrders: Number(row.manager_paid),
      revenueKopecks: Number(row.manager_revenue),
    },
    managers: managersResult.rows.map((item) => ({
      id: String(item.id),
      name: item.name,
      orders: Number(item.orders),
      paidOrders: Number(item.paid_orders),
      revenueKopecks: Number(item.revenue),
    })),
  };
}
