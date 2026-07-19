import { NextResponse } from 'next/server';
import { getManagerCrmPool } from '@/lib/manager-crm';

export const dynamic = 'force-dynamic';

const globalForLeads = global as typeof globalThis & { leadRateLimits?: Map<string, number[]> };
const rateLimits = (globalForLeads.leadRateLimits ??= new Map<string, number[]>());
const interestNames: Record<string, string> = {
  'electric-fireplace': 'электрокамин',
  hearth: 'очаг или портал',
  'bio-fireplace': 'биокамин',
  unsure: 'нужна помощь с выбором',
};

const cleanText = (value: unknown, max: number) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max);
const phoneDigits = (value: string) => value.replace(/\D/g, '');

function clientIp(request: Request) {
  return cleanText(
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown',
    80,
  );
}

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (rateLimits.get(ip) || []).filter((time) => now - time < 15 * 60 * 1000);
  recent.push(now);
  rateLimits.set(ip, recent);
  if (rateLimits.size > 5000) {
    rateLimits.forEach((values, key) => {
      if (!values.some((time) => now - time < 15 * 60 * 1000)) rateLimits.delete(key);
    });
  }
  return recent.length > 5;
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (rateLimited(ip))
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте немного позже.' },
      { status: 429 },
    );

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanText(body.name, 120);
    const phone = cleanText(body.phone, 32);
    const digits = phoneDigits(phone);
    const interest = interestNames[cleanText(body.interest, 40)] || interestNames.unsure;
    const page = cleanText(body.page, 300);

    if (cleanText(body.company, 100)) return NextResponse.json({ ok: true });
    if (body.consent !== 'yes')
      return NextResponse.json({ error: 'Необходимо согласие на обратную связь' }, { status: 400 });
    if (name.length < 2)
      return NextResponse.json({ error: 'Пожалуйста, укажите имя' }, { status: 400 });
    if (digits.length < 10 || digits.length > 15)
      return NextResponse.json({ error: 'Проверьте номер телефона' }, { status: 400 });

    const pool = getManagerCrmPool();
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const existing = await connection.query<{ id: string; manager_user_id: string }>(
        `SELECT c.id, c.manager_user_id
         FROM sales_clients c JOIN users u ON u.id = c.manager_user_id
         WHERE u.is_active = TRUE AND u.role = 'sales_manager'
           AND regexp_replace(c.phone, '\\D', '', 'g') = $1
         ORDER BY c.updated_at DESC LIMIT 1 FOR UPDATE OF c`,
        [digits],
      );

      let clientId: string;
      let managerId: string;
      const note = `Заявка из помощника сайта. Интерес: ${interest}.${page ? ` Страница: ${page}.` : ''}`;

      if (existing.rows[0]) {
        clientId = String(existing.rows[0].id);
        managerId = String(existing.rows[0].manager_user_id);
        await connection.query(
          `UPDATE sales_clients SET full_name=$1, phone=$2, source='website', notes=CASE WHEN notes IS NULL OR notes='' THEN $3 ELSE notes || E'\n' || $3 END, next_contact_at=NOW(), updated_at=NOW()
           WHERE id=$4`,
          [name, phone, note, clientId],
        );
      } else {
        const manager = await connection.query<{ id: string }>(
          `SELECT u.id FROM users u
           LEFT JOIN sales_clients c ON c.manager_user_id = u.id
           WHERE u.role='sales_manager' AND u.is_active=TRUE
           GROUP BY u.id ORDER BY COUNT(c.id), u.id LIMIT 1`,
        );
        if (!manager.rows[0]) {
          await connection.query('ROLLBACK');
          return NextResponse.json(
            { error: 'Сейчас не удалось назначить менеджера. Позвоните нам или попробуйте позже.' },
            { status: 503 },
          );
        }
        managerId = String(manager.rows[0].id);
        const created = await connection.query<{ id: string }>(
          `INSERT INTO sales_clients (manager_user_id, full_name, phone, source, notes, next_contact_at)
           VALUES ($1,$2,$3,'website',$4,NOW()) RETURNING id`,
          [managerId, name, phone, note],
        );
        clientId = String(created.rows[0].id);
      }

      const deal = await connection.query<{ id: string }>(
        `INSERT INTO sales_deals (manager_user_id, client_id, title, stage, probability, product_interest, notes, next_contact_at)
         VALUES ($1,$2,$3,'new',20,$4,$5,NOW()) RETURNING id`,
        [managerId, clientId, `Заявка с сайта: ${interest}`, interest, note],
      );
      const dealId = String(deal.rows[0].id);

      await connection.query(
        `INSERT INTO sales_tasks (manager_user_id, client_id, deal_id, title, description, due_at, priority)
         VALUES ($1,$2,$3,$4,$5,NOW() + INTERVAL '15 minutes','high')`,
        [
          managerId,
          clientId,
          dealId,
          `Связаться с ${name}`,
          `Новая заявка с сайта: ${interest}. Телефон: ${phone}`,
        ],
      );
      await connection.query(
        `INSERT INTO sales_activities (manager_user_id, client_id, deal_id, action, description)
         VALUES ($1,$2,$3,'website.lead_created',$4)`,
        [managerId, clientId, dealId, `Получена новая сделка с сайта от ${name}: ${interest}`],
      );
      await connection.query('COMMIT');
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Website lead creation failed:', error);
    return NextResponse.json(
      { error: 'Не удалось отправить заявку. Попробуйте ещё раз.' },
      { status: 500 },
    );
  }
}
