import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getManagerCrmPool } from '@/lib/manager-crm';

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

export async function POST(request: Request) {
  const auth = await manager();
  if ('error' in auth) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const entity = text(body.entity, 24);
    const pool = getManagerCrmPool();
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
    } else if (entity === 'deal') {
      const clientId = text(body.clientId, 30);
      const title = text(body.title, 240);
      const amount = Math.round(Number(body.amount || 0) * 100);
      const probability = Math.max(0, Math.min(100, Math.round(Number(body.probability || 20))));
      if (!validId(clientId) || title.length < 2 || !Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Проверьте клиента, название и сумму сделки' }, { status: 400 });
      const client = await pool.query('SELECT id FROM sales_clients WHERE id=$1 AND manager_user_id=$2', [clientId, auth.user.id]);
      if (!client.rows[0]) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
      const result = await pool.query<{ id: string }>(
        `INSERT INTO sales_deals (manager_user_id, client_id, title, amount_kopecks, probability, product_interest, notes, expected_close_date, next_contact_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [auth.user.id, clientId, title, amount, probability, optionalText(body.productInterest), optionalText(body.notes), optionalText(body.expectedCloseDate, 10), dateValue(body.nextContactAt)],
      );
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
    return NextResponse.json({ ok: true });
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
    if (entity === 'task') {
      const status = text(body.status, 16);
      if (!['open', 'done', 'cancelled'].includes(status)) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
      await pool.query(
        `UPDATE sales_tasks SET status=$1,completed_at=CASE WHEN $1='done' THEN NOW() ELSE NULL END,updated_at=NOW()
         WHERE id=$2 AND manager_user_id=$3`, [status, id, auth.user.id],
      );
    } else if (entity === 'deal') {
      const stage = text(body.stage, 32);
      if (!['new', 'qualification', 'proposal', 'negotiation', 'awaiting_payment', 'won', 'lost'].includes(stage)) return NextResponse.json({ error: 'Некорректный этап' }, { status: 400 });
      const deal = await pool.query<{ client_id: string; title: string }>(
        `UPDATE sales_deals SET stage=$1,probability=CASE $1 WHEN 'won' THEN 100 WHEN 'lost' THEN 0 ELSE probability END,
         closed_at=CASE WHEN $1 IN ('won','lost') THEN NOW() ELSE NULL END,updated_at=NOW()
         WHERE id=$2 AND manager_user_id=$3 RETURNING client_id,title`, [stage, id, auth.user.id],
      );
      if (deal.rows[0]) await pool.query(
        `INSERT INTO sales_activities (manager_user_id,client_id,deal_id,action,description)
         VALUES ($1,$2,$3,'deal.stage_changed',$4)`,
        [auth.user.id, deal.rows[0].client_id, id, `Этап сделки «${deal.rows[0].title}» изменён`],
      );
    } else if (entity === 'client') {
      const status = text(body.status, 32);
      if (!['active', 'vip', 'inactive'].includes(status)) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
      await pool.query('UPDATE sales_clients SET status=$1,updated_at=NOW() WHERE id=$2 AND manager_user_id=$3', [status, id, auth.user.id]);
    } else {
      return NextResponse.json({ error: 'Неизвестная операция' }, { status: 400 });
    }
    revalidatePath('/manager');
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Manager CRM update failed:', error);
    return NextResponse.json({ error: 'Не удалось обновить данные' }, { status: 500 });
  }
}
