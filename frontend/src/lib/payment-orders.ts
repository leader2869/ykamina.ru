import { Pool } from 'pg';
import { getDatabaseConnectionString } from '@/lib/database';
import type { TBankReceipt } from '@/lib/tbank-receipt';

const globalForPayments = global as typeof globalThis & { paymentOrdersPool?: Pool };
const databaseConnectionString = getDatabaseConnectionString();
const pool = databaseConnectionString
  ? (globalForPayments.paymentOrdersPool ??= new Pool({
      connectionString: databaseConnectionString,
      max: 2,
      idleTimeoutMillis: 10_000,
    }))
  : null;

export type StoredOrderItem = {
  productId: string;
  name: string;
  priceKopecks: number;
  quantity: number;
  listPriceKopecks?: number;
  purchaseCostKopecks?: number;
  discountKopecks?: number;
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
  purchaseCostKopecks: number;
  grossProfitKopecks: number;
  paidOrdersMissingCost: number;
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
    grossProfitKopecks: number;
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
  auditActorUserId?: string | null;
  paymentProvider?: 'tbank' | 'yandex_split';
  salesClientId?: string | null;
  salesDealId?: string | null;
}) {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO payment_orders
        (id, amount_kopecks, customer_name, customer_email, customer_phone, delivery_city, customer_comment, items, receipt, source, manager_user_id, payment_provider, sales_client_id, sales_deal_id)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14)`,
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
        order.salesClientId || null,
        order.salesDealId || null,
      ],
    );
    if (order.auditActorUserId) {
      await client.query(
        `INSERT INTO admin_audit_log
          (actor_user_id, action, entity_type, entity_id, entity_label, metadata)
         VALUES ($1, 'order.created', 'payment_order', $2, $3, $4::jsonb)`,
        [
          order.auditActorUserId,
          order.id,
          `Заказ для ${order.name}`,
          JSON.stringify({
            source: order.source || 'website',
            amountKopecks: order.amountKopecks,
            itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
          }),
        ],
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
    if (normalizedStatus === 'confirmed') {
      const deal = await client.query<{ id: string; manager_user_id: string; client_id: string; title: string }>(
        `UPDATE sales_deals d SET stage='won',probability=100,closed_at=NOW(),updated_at=NOW()
         FROM payment_orders o WHERE o.id=$1::uuid AND o.sales_deal_id=d.id AND d.stage<>'won'
         RETURNING d.id,d.manager_user_id,d.client_id,d.title`, [orderId],
      );
      if (deal.rows[0]) await client.query(
        `INSERT INTO sales_activities (manager_user_id,client_id,deal_id,action,description)
         VALUES ($1,$2,$3,'payment.confirmed',$4)`,
        [deal.rows[0].manager_user_id, deal.rows[0].client_id, deal.rows[0].id, `Сделка «${deal.rows[0].title}» оплачена`],
      );
    } else if (['cancelled', 'refunded', 'reversed'].includes(normalizedStatus)) {
      await client.query(
        `UPDATE sales_deals d SET stage='lost',probability=0,closed_at=NOW(),updated_at=NOW()
         FROM payment_orders o WHERE o.id=$1::uuid AND o.sales_deal_id=d.id AND d.stage NOT IN ('won','lost')`, [orderId],
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
      purchase_cost: string;
      gross_profit: string;
      missing_cost: string;
      awaiting_payment: string;
      website_orders: string;
      website_paid: string;
      website_revenue: string;
      manager_orders: string;
      manager_paid: string;
      manager_revenue: string;
    }>(
      `WITH financial_orders AS (
        SELECT o.*,
          CASE WHEN NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(o.items) item
            WHERE NOT (item ? 'purchaseCostKopecks') OR COALESCE((item->>'purchaseCostKopecks')::bigint, 0) <= 0
          ) THEN (
            SELECT COALESCE(SUM((item->>'purchaseCostKopecks')::bigint * (item->>'quantity')::integer), 0)
            FROM jsonb_array_elements(o.items) item
          ) ELSE NULL END AS purchase_cost
        FROM payment_orders o
      )
      SELECT COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE o.status = 'confirmed') AS paid_orders,
        COALESCE(SUM(o.amount_kopecks) FILTER (WHERE o.status = 'confirmed'), 0) AS revenue,
        COALESCE(SUM(o.purchase_cost) FILTER (WHERE o.status = 'confirmed' AND o.purchase_cost IS NOT NULL), 0) AS purchase_cost,
        COALESCE(SUM(o.amount_kopecks - o.purchase_cost) FILTER (WHERE o.status = 'confirmed' AND o.purchase_cost IS NOT NULL), 0) AS gross_profit,
        COUNT(*) FILTER (WHERE o.status = 'confirmed' AND o.purchase_cost IS NULL) AS missing_cost,
        COUNT(*) FILTER (WHERE o.status IN ('created', 'payment_initialized')) AS awaiting_payment,
        COUNT(*) FILTER (WHERE o.source = 'website') AS website_orders,
        COUNT(*) FILTER (WHERE o.source = 'website' AND o.status = 'confirmed') AS website_paid,
        COALESCE(SUM(o.amount_kopecks) FILTER (WHERE o.source = 'website' AND o.status = 'confirmed'), 0) AS website_revenue,
        COUNT(*) FILTER (WHERE o.source = 'manager') AS manager_orders,
        COUNT(*) FILTER (WHERE o.source = 'manager' AND o.status = 'confirmed') AS manager_paid,
        COALESCE(SUM(o.amount_kopecks) FILTER (WHERE o.source = 'manager' AND o.status = 'confirmed'), 0) AS manager_revenue
      FROM financial_orders o ${filter}`,
      params,
    ),
    database().query<{
      id: string;
      name: string;
      orders: string;
      paid_orders: string;
      revenue: string;
      gross_profit: string;
    }>(
      `WITH financial_orders AS (
        SELECT o.*,
          CASE WHEN NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(o.items) item
            WHERE NOT (item ? 'purchaseCostKopecks') OR COALESCE((item->>'purchaseCostKopecks')::bigint, 0) <= 0
          ) THEN (
            SELECT COALESCE(SUM((item->>'purchaseCostKopecks')::bigint * (item->>'quantity')::integer), 0)
            FROM jsonb_array_elements(o.items) item
          ) ELSE NULL END AS purchase_cost
        FROM payment_orders o
      )
      SELECT u.id, u.full_name AS name,
        COUNT(o.id) AS orders, COUNT(o.id) FILTER (WHERE o.status = 'confirmed') AS paid_orders,
        COALESCE(SUM(o.amount_kopecks) FILTER (WHERE o.status = 'confirmed'), 0) AS revenue,
        COALESCE(SUM(o.amount_kopecks - o.purchase_cost) FILTER (WHERE o.status = 'confirmed' AND o.purchase_cost IS NOT NULL), 0) AS gross_profit
      FROM financial_orders o JOIN users u ON u.id = o.manager_user_id
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
    purchaseCostKopecks: Number(row.purchase_cost),
    grossProfitKopecks: Number(row.gross_profit),
    paidOrdersMissingCost: Number(row.missing_cost),
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
      grossProfitKopecks: Number(item.gross_profit),
    })),
  };
}
