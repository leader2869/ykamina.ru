import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { financeCategoryNames, getCompanyFinancePool } from '@/lib/company-finance';

export const dynamic = 'force-dynamic';

async function superAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 }) };
  if (user.role !== 'super_admin') return { error: NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 }) };
  return { user };
}

const monthDate = (value: unknown) => {
  const month = String(value || '');
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `${month}-01` : null;
};

async function financeTableReady() {
  const result = await getCompanyFinancePool().query<{ ready: boolean }>(`SELECT to_regclass('public.company_expenses') IS NOT NULL AS ready`);
  return Boolean(result.rows[0]?.ready);
}

export async function POST(request: Request) {
  const auth = await superAdmin();
  if ('error' in auth) return auth.error;
  try {
    if (!await financeTableReady()) return NextResponse.json({ error: 'Сначала нужно применить обновление базы данных' }, { status: 409 });
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name || '').trim().slice(0, 180);
    const category = String(body.category || 'other');
    const calculationType = body.calculationType === 'revenue_percent' ? 'revenue_percent' : 'fixed';
    const recurrence = body.recurrence === 'recurring' ? 'recurring' : 'one_time';
    const startMonth = monthDate(body.startMonth);
    const endMonth = recurrence === 'recurring' ? monthDate(body.endMonth) : null;
    const notes = String(body.notes || '').trim().slice(0, 2000) || null;
    const amountKopecks = calculationType === 'fixed' ? Math.round(Number(body.amount || 0) * 100) : null;
    const revenuePercent = calculationType === 'revenue_percent' ? Number(body.revenuePercent) : null;

    if (name.length < 2 || !(category in financeCategoryNames) || !startMonth) return NextResponse.json({ error: 'Проверьте название, категорию и месяц' }, { status: 400 });
    if (amountKopecks !== null && (!Number.isFinite(amountKopecks) || amountKopecks <= 0)) return NextResponse.json({ error: 'Укажите сумму расхода' }, { status: 400 });
    if (revenuePercent !== null && (!Number.isFinite(revenuePercent) || revenuePercent <= 0 || revenuePercent > 100)) return NextResponse.json({ error: 'Укажите процент от 0 до 100' }, { status: 400 });
    if (endMonth && endMonth < startMonth) return NextResponse.json({ error: 'Месяц окончания не может быть раньше начала' }, { status: 400 });

    await getCompanyFinancePool().query(
      `INSERT INTO company_expenses
        (name,category,calculation_type,amount_kopecks,revenue_percent,recurrence,start_month,end_month,notes,created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [name, category, calculationType, amountKopecks, revenuePercent, recurrence, startMonth, endMonth, notes, auth.user.id],
    );
    revalidatePath('/admin');
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Finance expense creation failed:', error);
    return NextResponse.json({ error: 'Не удалось сохранить расход' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await superAdmin();
  if ('error' in auth) return auth.error;
  try {
    if (!await financeTableReady()) return NextResponse.json({ error: 'Сначала нужно применить обновление базы данных' }, { status: 409 });
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id || '');
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Расход не найден' }, { status: 404 });
    await getCompanyFinancePool().query('DELETE FROM company_expenses WHERE id=$1', [id]);
    revalidatePath('/admin');
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Finance expense deletion failed:', error);
    return NextResponse.json({ error: 'Не удалось удалить расход' }, { status: 500 });
  }
}
