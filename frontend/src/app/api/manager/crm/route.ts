import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getManagerCrmPool } from '@/lib/manager-crm';
import { cancelTBankPayment, initTBankPayment } from '@/lib/tbank';
import { buildTBankReceipt } from '@/lib/tbank-receipt';

export const dynamic = 'force-dynamic';

async function manager() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 }) };
  if (user.role !== 'sales_manager') return { error: NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 }) };
  return { user };
}

const text = (value: unknown, max = 5000) => String(value || '').trim().slice(0, max);
const optionalText = (value: unknown, max = 5000) => text(value, max) || null;
const validId = (value: unknown) => /^\d+$/.test(String(value || ''));
const dateValue = (value: unknown) => {
  const raw = text(value, 40);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

async function hasPurchaseCostColumn() {
  const result = await getManagerCrmPool().query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='sales_deals' AND column_name='purchase_cost_kopecks'
    ) AS exists`,
  );
  return Boolean(result.rows[0]?.exists);
}

async function syncFollowUpTask(
  pool: ReturnType<typeof getManagerCrmPool>,
  managerUserId: string,
  clientId: string,
  dealId: string,
  dealTitle: string,
  dueAt: string | null | undefined,
) {
  if (!dueAt) return;
  const title = `Связаться с клиентом: ${dealTitle}`;
  const existing = await pool.query<{ id: string }>(
    `UPDATE sales_tasks SET title=$1, due_at=$2, updated_at=NOW()
     WHERE manager_user_id=$3 AND deal_id=$4 AND status='open' AND title LIKE 'Связаться с клиентом:%'
     RETURNING id`,
    [title, dueAt, managerUserId, dealId],
  );
  if (!existing.rows[0]) {
    await pool.query(
      `INSERT INTO sales_tasks (manager_user_id, client_id, deal_id, title, description, due_at, priority)
       VALUES ($1,$2,$3,$4,'Автоматически создано по дате следующего контакта в заявке',$5,'normal')`,
      [managerUserId, clientId, dealId, title, dueAt],
    );
  }
}

async function createSaleForDeal(
  pool: ReturnType<typeof getManagerCrmPool>,
  managerUserId: string,
  deal: { id: string; client_id: string; title: string; amount_kopecks: string; product_interest: string | null; notes: string | null },
  baseUrl: string,
) {
  const existing = await pool.query<{ id: string; status: string; payment_url: string | null }>(
    'SELECT id::text,status,payment_url FROM payment_orders WHERE sales_deal_id=$1 ORDER BY created_at DESC LIMIT 1',
    [deal.id],
  );
  if (existing.rows[0] && ['created', 'payment_initialized', 'authorized'].includes(existing.rows[0].status)) {
    return existing.rows[0].payment_url;
  }
  if (existing.rows[0]?.status === 'confirmed') return null;
  const client = await pool.query<{ full_name: string; email: string | null; phone: string | null; city: string | null }>(
    'SELECT full_name,email,phone,city FROM sales_clients WHERE id=$1 AND manager_user_id=$2',
    [deal.client_id, managerUserId],
  );
  if (!client.rows[0]) throw new Error('Клиент заявки не найден');
  const names = (deal.product_interest || '').split(' · ').map((name) => name.trim()).filter(Boolean);
  const products = names.length
    ? await pool.query<{ id: string; name: string; price: string }>('SELECT id,name,price FROM products WHERE name = ANY($1::text[])', [names])
    : { rows: [] as { id: string; name: string; price: string }[] };
  const amount = Number(deal.amount_kopecks);
  const catalogTotal = products.rows.reduce((sum, product) => sum + Math.round(Number(product.price) * 100), 0);
  let remaining = amount;
  const orderProducts = products.rows.length ? products.rows : (names.length ? names : [deal.title]).map((name) => ({ id: '', name, price: '0' }));
  const items = orderProducts.map((product, index, list) => {
    const catalogPrice = Math.round(Number(product.price) * 100);
    const priceKopecks = index === list.length - 1
      ? remaining
      : catalogTotal > 0
        ? Math.round(amount * catalogPrice / catalogTotal)
        : Math.round(amount / list.length);
    remaining -= priceKopecks;
    return { productId: product.id, name: product.name, priceKopecks, quantity: 1 };
  });
  const orderId = randomUUID();
  const receipt = buildTBankReceipt(items, { email: client.rows[0].email || '', phone: client.rows[0].phone || undefined });
  await pool.query(
    `INSERT INTO payment_orders
      (id,amount_kopecks,customer_name,customer_email,customer_phone,delivery_city,customer_comment,items,receipt,source,manager_user_id,payment_provider,sales_client_id,sales_deal_id)
     VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,'manager',$10,'tbank',$11,$12)`,
    [orderId, amount, client.rows[0].full_name, client.rows[0].email || '', client.rows[0].phone || '', client.rows[0].city || '', deal.notes, JSON.stringify(items), JSON.stringify(receipt), managerUserId, deal.client_id, deal.id],
  );
  try {
    const payment = await initTBankPayment({
      Amount: amount,
      OrderId: orderId,
      Description: `Продажа по заявке: ${deal.title}`.slice(0, 140),
      PayType: 'O',
      Language: 'ru',
      SuccessURL: `${baseUrl}/checkout/result?success=true&orderId=${orderId}`,
      FailURL: `${baseUrl}/checkout/result?success=false&orderId=${orderId}`,
      NotificationURL: `${baseUrl}/api/payments/tbank/notification`,
      DATA: { Email: client.rows[0].email || '', Phone: client.rows[0].phone || '' },
      Receipt: receipt,
    });
    await pool.query(
      `UPDATE payment_orders SET status='payment_initialized', tbank_payment_id=$1, payment_url=$2, updated_at=NOW() WHERE id=$3::uuid`,
      [payment.PaymentId || null, payment.PaymentURL, orderId],
    );
    return payment.PaymentURL || null;
  } catch (error) {
    console.error('Automatic payment link initialization failed:', error);
    await pool.query(`UPDATE payment_orders SET status='payment_init_failed', updated_at=NOW() WHERE id=$1::uuid`, [orderId]);
  }
  await pool.query(
    `INSERT INTO sales_activities (manager_user_id,client_id,deal_id,action,description)
     VALUES ($1,$2,$3,'payment.created',$4)`,
    [managerUserId, deal.client_id, deal.id, `Создана продажа по заявке «${deal.title}»`],
  );
  return null;
}

async function cancelUnpaidSaleForDeal(pool: ReturnType<typeof getManagerCrmPool>, dealId: string) {
  const order = await pool.query<{ id: string; status: string; tbank_payment_id: string | null }>(
    `SELECT id::text,status,tbank_payment_id FROM payment_orders
     WHERE sales_deal_id=$1 AND status NOT IN ('confirmed','cancelled','canceled','reversed','refunded')
     ORDER BY created_at DESC LIMIT 1`,
    [dealId],
  );
  const sale = order.rows[0];
  if (!sale) return;
  const reason = 'Заявка возвращена на согласование';
  if (!sale.tbank_payment_id) {
    await pool.query(
      `UPDATE payment_orders SET status='cancelled',cancellation_reason=$1,cancelled_at=NOW(),updated_at=NOW() WHERE id=$2::uuid`,
      [reason, sale.id],
    );
    return;
  }
  await pool.query(
    `UPDATE payment_orders SET status='cancellation_pending',cancellation_reason=$1,cancellation_requested_at=NOW(),updated_at=NOW() WHERE id=$2::uuid`,
    [reason, sale.id],
  );
  try {
    const result = await cancelTBankPayment(sale.tbank_payment_id);
    await pool.query(
      `UPDATE payment_orders SET status=$1,cancelled_at=NOW(),cancellation_response=$2::jsonb,updated_at=NOW() WHERE id=$3::uuid`,
      [(result.Status || 'cancelled').toLowerCase(), JSON.stringify(result), sale.id],
    );
  } catch (error) {
    console.error('Automatic payment cancellation failed:', error);
  }
}

export async function POST(request: Request) {
  const auth = await manager();
  if ('error' in auth) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const entity = text(body.entity, 24);
    const pool = getManagerCrmPool();
    let createdId: string | null = null;
    if (entity === 'client') {
      const fullName = text(body.fullName, 180);
      const phone = optionalText(body.phone, 64);
      const email = optionalText(body.email, 254)?.toLowerCase() || null;
      const city = optionalText(body.city, 160);
      const source = ['manager', 'website', 'phone', 'messenger', 'recommendation', 'other'].includes(text(body.source, 32)) ? text(body.source, 32) : 'manager';
      if (fullName.length < 2 || (!phone && !email)) return NextResponse.json({ error: 'Укажите имя и хотя бы телефон или email' }, { status: 400 });
      const result = await pool.query<{ id: string }>(
        `INSERT INTO sales_clients (manager_user_id, full_name, phone, email, city, source, notes, next_contact_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [auth.user.id, fullName, phone, email, city, source, optionalText(body.notes), dateValue(body.nextContactAt)],
      );
      await pool.query(
        `INSERT INTO sales_activities (manager_user_id, client_id, action, description)
         VALUES ($1,$2,'client.created',$3)`,
        [auth.user.id, result.rows[0].id, `Добавлен клиент ${fullName}`],
      );
      createdId = String(result.rows[0].id);
    } else if (entity === 'deal') {
      const clientId = text(body.clientId, 30);
      const title = text(body.title, 240);
      const amount = Math.round(Number(body.amount || 0) * 100);
      const probability = Math.max(0, Math.min(100, Math.round(Number(body.probability || 20))));
      const discount = Math.max(0, Number(body.discount || 0));
      const purchaseCost = Math.round(Number(body.purchaseCost || 0) * 100);
      const nextContactAt = dateValue(body.nextContactAt);
      if (!validId(clientId) || title.length < 2 || !Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Проверьте клиента, название и сумму сделки' }, { status: 400 });
      if (discount > 0 && (!Number.isFinite(purchaseCost) || purchaseCost <= 0)) return NextResponse.json({ error: 'Для скидки укажите закупочную стоимость товаров' }, { status: 400 });
      if (discount > 0 && purchaseCost > amount) return NextResponse.json({ error: 'Итог со скидкой не может быть ниже закупочной стоимости' }, { status: 400 });
      const client = await pool.query('SELECT id FROM sales_clients WHERE id=$1 AND manager_user_id=$2', [clientId, auth.user.id]);
      if (!client.rows[0]) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
      if (discount > 0 && !await hasPurchaseCostColumn()) return NextResponse.json({ error: 'Сначала нужно применить локальное обновление базы данных для учёта закупки' }, { status: 409 });
      const result = await pool.query<{ id: string }>(
        `INSERT INTO sales_deals (manager_user_id, client_id, title, amount_kopecks, probability, product_interest, notes, expected_close_date, next_contact_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [auth.user.id, clientId, title, amount, probability, optionalText(body.productInterest), optionalText(body.notes), optionalText(body.expectedCloseDate, 10), nextContactAt],
      );
      if (discount > 0) await pool.query('UPDATE sales_deals SET purchase_cost_kopecks=$1 WHERE id=$2', [purchaseCost, result.rows[0].id]);
      await syncFollowUpTask(pool, auth.user.id, clientId, result.rows[0].id, title, nextContactAt);
      await pool.query(
        `INSERT INTO sales_activities (manager_user_id, client_id, deal_id, action, description)
         VALUES ($1,$2,$3,'deal.created',$4)`,
        [auth.user.id, clientId, result.rows[0].id, `Создана сделка «${title}»`],
      );
    } else if (entity === 'task') {
      const title = text(body.title, 240);
      const dueAt = dateValue(body.dueAt);
      const clientId = validId(body.clientId) ? text(body.clientId, 30) : null;
      const dealId = validId(body.dealId) ? text(body.dealId, 30) : null;
      const priority = ['low', 'normal', 'high'].includes(text(body.priority, 16)) ? text(body.priority, 16) : 'normal';
      if (title.length < 2 || !dueAt) return NextResponse.json({ error: 'Укажите задачу и срок' }, { status: 400 });
      if (clientId) {
        const client = await pool.query('SELECT id FROM sales_clients WHERE id=$1 AND manager_user_id=$2', [clientId, auth.user.id]);
        if (!client.rows[0]) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
      }
      if (dealId) {
        const deal = await pool.query('SELECT id,client_id FROM sales_deals WHERE id=$1 AND manager_user_id=$2', [dealId, auth.user.id]);
        if (!deal.rows[0]) return NextResponse.json({ error: 'Сделка не найдена' }, { status: 404 });
      }
      await pool.query(
        `INSERT INTO sales_tasks (manager_user_id, client_id, deal_id, title, description, due_at, priority)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [auth.user.id, clientId, dealId, title, optionalText(body.description), dueAt, priority],
      );
    } else if (entity === 'activity') {
      const clientId = validId(body.clientId) ? text(body.clientId, 30) : null;
      const dealId = validId(body.dealId) ? text(body.dealId, 30) : null;
      const description = text(body.description, 5000);
      if (!description || (!clientId && !dealId)) return NextResponse.json({ error: 'Укажите заметку и клиента или сделку' }, { status: 400 });
      await pool.query(
        `INSERT INTO sales_activities (manager_user_id, client_id, deal_id, action, description)
         SELECT $1,$2,$3,'note.created',$4
         WHERE ($2::bigint IS NULL OR EXISTS (SELECT 1 FROM sales_clients WHERE id=$2 AND manager_user_id=$1))
           AND ($3::bigint IS NULL OR EXISTS (SELECT 1 FROM sales_deals WHERE id=$3 AND manager_user_id=$1))`,
        [auth.user.id, clientId, dealId, description],
      );
      if (clientId) await pool.query('UPDATE sales_clients SET last_contact_at=NOW(),updated_at=NOW() WHERE id=$1 AND manager_user_id=$2', [clientId, auth.user.id]);
    } else {
      return NextResponse.json({ error: 'Неизвестная операция' }, { status: 400 });
    }
    revalidatePath('/manager');
    return NextResponse.json({ ok: true, id: createdId });
  } catch (error) {
    const databaseError = error as { code?: string };
    console.error('Manager CRM creation failed:', error);
    return NextResponse.json({ error: databaseError.code === '23505' ? 'Клиент с таким email уже есть' : 'Не удалось сохранить данные' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await manager();
  if ('error' in auth) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const entity = text(body.entity, 24);
    const id = text(body.id, 30);
    if (!validId(id)) return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
    const pool = getManagerCrmPool();
    let createdPaymentUrl: string | null = null;
    if (entity === 'task') {
      const status = text(body.status, 16);
      if (!['open', 'done', 'cancelled'].includes(status)) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
      const task = await pool.query<{ id: string }>(
        `UPDATE sales_tasks
         SET status=$1::varchar(16),
             completed_at=CASE WHEN $1::varchar(16)='done'::varchar THEN NOW() ELSE NULL END,
             updated_at=NOW()
         WHERE id=$2 AND manager_user_id=$3
         RETURNING id`,
        [status, id, auth.user.id],
      );
      if (!task.rows[0]) return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 });
    } else if (entity === 'deal') {
      const stage = text(body.stage, 32);
      if (!['new', 'qualification', 'proposal', 'negotiation', 'awaiting_payment', 'won', 'lost'].includes(stage)) return NextResponse.json({ error: 'Некорректный этап' }, { status: 400 });
      const currentDeal = await pool.query<{ stage: string }>(
        'SELECT stage FROM sales_deals WHERE id=$1 AND manager_user_id=$2',
        [id, auth.user.id],
      );
      if (!currentDeal.rows[0]) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
      if (currentDeal.rows[0].stage === 'won' && stage !== 'won') {
        return NextResponse.json({ error: 'Успешную сделку можно перевести в отказ только после возврата средств' }, { status: 400 });
      }
      if (stage === 'negotiation') {
        const clientDetails = await pool.query<{ full_name: string; email: string | null; city: string | null }>(
          `SELECT c.full_name,c.email,c.city FROM sales_deals d
           JOIN sales_clients c ON c.id=d.client_id
           WHERE d.id=$1 AND d.manager_user_id=$2`,
          [id, auth.user.id],
        );
        const client = clientDetails.rows[0];
        if (!client || !client.full_name.trim() || !client.email?.trim() || !client.city?.trim()) {
          return NextResponse.json({ error: 'Для согласования заполните ФИО, адрес доставки и email клиента' }, { status: 400 });
        }
      }
      if (stage === 'won') {
        if (!await hasPurchaseCostColumn()) return NextResponse.json({ error: 'Сначала нужно применить локальное обновление базы данных' }, { status: 409 });
        const finances = await pool.query<{ purchase_cost_kopecks: string | null }>(
          'SELECT purchase_cost_kopecks FROM sales_deals WHERE id=$1 AND manager_user_id=$2',
          [id, auth.user.id],
        );
        if (!finances.rows[0] || finances.rows[0].purchase_cost_kopecks === null) {
          return NextResponse.json({ error: 'Перед завершением сделки укажите сумму закупки' }, { status: 400 });
        }
      }
      const deal = await pool.query<{ id: string; client_id: string; title: string; amount_kopecks: string; product_interest: string | null; notes: string | null }>(
        `UPDATE sales_deals SET stage=$1::varchar,probability=CASE $1::varchar WHEN 'won' THEN 100 WHEN 'lost' THEN 0 ELSE probability END,
         closed_at=CASE WHEN $1::varchar IN ('won','lost') THEN NOW() ELSE NULL END,updated_at=NOW()
         WHERE id=$2 AND manager_user_id=$3 RETURNING id,client_id,title,amount_kopecks,product_interest,notes`, [stage, id, auth.user.id],
      );
      if (!deal.rows[0]) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
      if (stage === 'awaiting_payment') {
        const configuredBaseUrl = process.env.NEXT_PUBLIC_SITE_URL;
        const baseUrl = configuredBaseUrl ? new URL(configuredBaseUrl).origin : new URL(request.url).origin;
        createdPaymentUrl = await createSaleForDeal(pool, auth.user.id, deal.rows[0], baseUrl);
      }
      if (stage === 'negotiation') await cancelUnpaidSaleForDeal(pool, id);
      if (deal.rows[0]) await pool.query(
        `INSERT INTO sales_activities (manager_user_id,client_id,deal_id,action,description)
         VALUES ($1,$2,$3,'deal.stage_changed',$4)`,
        [auth.user.id, deal.rows[0].client_id, id, `Этап сделки «${deal.rows[0].title}» изменён`],
      );
    } else if (entity === 'deal-details') {
      const title = text(body.title, 240);
      const amount = Math.round(Number(body.amount || 0) * 100);
      const probability = Math.max(0, Math.min(100, Math.round(Number(body.probability || 0))));
      const discount = Math.max(0, Number(body.discount || 0));
      const purchaseCost = Math.round(Number(body.purchaseCost || 0) * 100);
      const nextContactAt = dateValue(body.nextContactAt);
      if (!title) return NextResponse.json({ error: 'Укажите название заявки' }, { status: 400 });
      if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Укажите корректную сумму' }, { status: 400 });
      if (discount > 0 && (!Number.isFinite(purchaseCost) || purchaseCost <= 0)) return NextResponse.json({ error: 'Для скидки укажите закупочную стоимость товаров' }, { status: 400 });
      if (discount > 0 && purchaseCost > amount) return NextResponse.json({ error: 'Итог со скидкой не может быть ниже закупочной стоимости' }, { status: 400 });
      if (discount > 0 && !await hasPurchaseCostColumn()) return NextResponse.json({ error: 'Сначала нужно применить локальное обновление базы данных для учёта закупки' }, { status: 409 });
      const deal = await pool.query<{ client_id: string }>(
        `UPDATE sales_deals
         SET title=$1, amount_kopecks=$2, probability=$3, product_interest=$4, notes=$5,
             expected_close_date=$6, next_contact_at=$7, updated_at=NOW()
         WHERE id=$8 AND manager_user_id=$9
         RETURNING client_id`,
        [title, amount, probability, optionalText(body.productInterest), optionalText(body.notes), optionalText(body.expectedCloseDate, 10), nextContactAt, id, auth.user.id],
      );
      if (!deal.rows[0]) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
      if (discount > 0) await pool.query('UPDATE sales_deals SET purchase_cost_kopecks=$1 WHERE id=$2 AND manager_user_id=$3', [purchaseCost, id, auth.user.id]);
      await syncFollowUpTask(pool, auth.user.id, deal.rows[0].client_id, id, title, nextContactAt);
      await pool.query(
        `INSERT INTO sales_activities (manager_user_id,client_id,deal_id,action,description)
         VALUES ($1,$2,$3,'deal.updated',$4)`,
        [auth.user.id, deal.rows[0].client_id, id, `Обновлена заявка «${title}»`],
      );
    } else if (entity === 'deal-cost') {
      if (!await hasPurchaseCostColumn()) return NextResponse.json({ error: 'Сначала нужно применить локальное обновление базы данных' }, { status: 409 });
      const purchaseCost = Math.round(Number(body.purchaseCost || 0) * 100);
      if (!Number.isFinite(purchaseCost) || purchaseCost <= 0) return NextResponse.json({ error: 'Укажите корректную сумму закупки' }, { status: 400 });
      const deal = await pool.query<{ client_id: string; title: string; amount_kopecks: string }>(
        `SELECT client_id,title,amount_kopecks FROM sales_deals WHERE id=$1 AND manager_user_id=$2`,
        [id, auth.user.id],
      );
      if (!deal.rows[0]) return NextResponse.json({ error: 'Сделка не найдена' }, { status: 404 });
      if (purchaseCost > Number(deal.rows[0].amount_kopecks)) return NextResponse.json({ error: 'Сумма закупки не может быть выше суммы сделки' }, { status: 400 });
      await pool.query(
        'UPDATE sales_deals SET purchase_cost_kopecks=$1,updated_at=NOW() WHERE id=$2 AND manager_user_id=$3',
        [purchaseCost, id, auth.user.id],
      );
      await pool.query(
        `INSERT INTO sales_activities (manager_user_id,client_id,deal_id,action,description)
         VALUES ($1,$2,$3,'deal.cost_updated',$4)`,
        [auth.user.id, deal.rows[0].client_id, id, `Указана сумма закупки по сделке «${deal.rows[0].title}»`],
      );
    } else if (entity === 'client-details') {
      const fullName = text(body.fullName, 180);
      const phone = optionalText(body.phone, 64);
      const email = optionalText(body.email, 254)?.toLowerCase() || null;
      const city = optionalText(body.city, 160);
      const status = text(body.status, 32);
      if (fullName.length < 2 || (!phone && !email)) return NextResponse.json({ error: 'Укажите имя и хотя бы телефон или email' }, { status: 400 });
      if (!['active', 'vip', 'inactive'].includes(status)) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
      const client = await pool.query<{ id: string }>(
        `UPDATE sales_clients SET full_name=$1, phone=$2, email=$3, city=$4, status=$5, notes=$6,
         next_contact_at=$7, updated_at=NOW() WHERE id=$8 AND manager_user_id=$9 RETURNING id`,
        [fullName, phone, email, city, status, optionalText(body.notes), dateValue(body.nextContactAt), id, auth.user.id],
      );
      if (!client.rows[0]) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    } else if (entity === 'client') {
      const status = text(body.status, 32);
      if (!['active', 'vip', 'inactive'].includes(status)) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
      await pool.query('UPDATE sales_clients SET status=$1,updated_at=NOW() WHERE id=$2 AND manager_user_id=$3', [status, id, auth.user.id]);
    } else {
      return NextResponse.json({ error: 'Неизвестная операция' }, { status: 400 });
    }
    revalidatePath('/manager');
    return NextResponse.json({ ok: true, paymentUrl: createdPaymentUrl });
  } catch (error) {
    console.error('Manager CRM update failed:', error);
    return NextResponse.json({ error: 'Не удалось обновить данные' }, { status: 500 });
  }
}
