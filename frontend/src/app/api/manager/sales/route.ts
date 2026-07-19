import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getProduct } from '@/lib/catalog-repository';
import { createPaymentOrder, markPaymentInitialized, markPaymentInitFailed } from '@/lib/payment-orders';
import { initTBankPayment } from '@/lib/tbank';
import { buildTBankReceipt } from '@/lib/tbank-receipt';
import { getManagerCrmPool } from '@/lib/manager-crm';

export const dynamic = 'force-dynamic';

type RequestItem = { productId?: unknown; quantity?: unknown };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
  if (user.role !== 'sales_manager' && user.role !== 'super_admin') return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });

  try {
    const body = await request.json() as { items?: RequestItem[]; name?: unknown; email?: unknown; phone?: unknown; city?: unknown; comment?: unknown };
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20) return NextResponse.json({ error: 'Добавьте от 1 до 20 товаров' }, { status: 400 });
    const items = body.items.map((item) => ({ productId: String(item.productId || ''), quantity: Number(item.quantity) }));
    if (items.some((item) => !/^\d+$/.test(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10)) return NextResponse.json({ error: 'Некорректный состав заказа' }, { status: 400 });

    const products = await Promise.all(items.map((item) => getProduct(item.productId, true)));
    if (products.some((product) => !product)) return NextResponse.json({ error: 'Один из товаров не найден' }, { status: 400 });
    const amount = products.reduce((sum, product, index) => sum + Math.round(product!.price * 100) * items[index].quantity, 0);
    if (amount <= 0 || amount > 9_999_999_999) return NextResponse.json({ error: 'Некорректная сумма продажи' }, { status: 400 });

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 160) : '';
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 64) : '';
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 160) : '';
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';
    if (!name || !email || !phone || !city) return NextResponse.json({ error: 'Заполните данные клиента' }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Укажите корректный email' }, { status: 400 });

    const orderId = randomUUID().replaceAll('-', '');
    const storedItems = products.map((product, index) => ({ productId: product!.id, name: product!.name, priceKopecks: Math.round(product!.price * 100), quantity: items[index].quantity }));
    const receipt = buildTBankReceipt(storedItems, { email, phone });
    let salesClientId: string | null = null;
    let salesDealId: string | null = null;
    if (user.role === 'sales_manager') {
      const crm = getManagerCrmPool();
      const existingClient = await crm.query<{ id: string }>('SELECT id FROM sales_clients WHERE manager_user_id=$1 AND LOWER(email)=LOWER($2) LIMIT 1', [user.id, email]);
      if (existingClient.rows[0]) {
        salesClientId = String(existingClient.rows[0].id);
        await crm.query('UPDATE sales_clients SET full_name=$1,phone=$2,city=$3,updated_at=NOW() WHERE id=$4', [name, phone, city, salesClientId]);
      } else {
        const client = await crm.query<{ id: string }>(`INSERT INTO sales_clients (manager_user_id,full_name,phone,email,city,source,notes) VALUES ($1,$2,$3,$4,$5,'manager',$6) RETURNING id`, [user.id, name, phone, email.toLowerCase(), city, comment || null]);
        salesClientId = String(client.rows[0].id);
      }
      const deal = await crm.query<{ id: string }>(`INSERT INTO sales_deals (manager_user_id,client_id,title,stage,amount_kopecks,probability,product_interest,notes) VALUES ($1,$2,$3,'awaiting_payment',$4,70,$5,$6) RETURNING id`, [user.id, salesClientId, `Продажа: ${storedItems[0].name}`.slice(0, 240), amount, storedItems.map((item) => item.name).join(', '), comment || null]);
      salesDealId = String(deal.rows[0].id);
      await crm.query(`INSERT INTO sales_activities (manager_user_id,client_id,deal_id,action,description) VALUES ($1,$2,$3,'payment.created',$4)`, [user.id, salesClientId, salesDealId, `Сформирована ссылка на оплату на ${Math.round(amount / 100).toLocaleString('ru-RU')} ₽`]);
    }
    await createPaymentOrder({ id: orderId, amountKopecks: amount, name, email, phone, city, comment, items: storedItems, receipt, source: 'manager', managerUserId: user.id, auditActorUserId: user.id, salesClientId, salesDealId });

    try {
      const configuredBaseUrl = process.env.NEXT_PUBLIC_SITE_URL;
      const baseUrl = configuredBaseUrl ? new URL(configuredBaseUrl).origin : new URL(request.url).origin;
      const result = await initTBankPayment({
        Amount: amount,
        OrderId: orderId,
        Description: `Продажа менеджера: ${storedItems.map((item) => item.name).join(', ')}`.slice(0, 140),
        PayType: 'O', Language: 'ru',
        SuccessURL: `${baseUrl}/checkout/result?success=true&orderId=${orderId}`,
        FailURL: `${baseUrl}/checkout/result?success=false&orderId=${orderId}`,
        NotificationURL: `${baseUrl}/api/payments/tbank/notification`,
        DATA: { Email: email, Phone: phone }, Receipt: receipt,
      });
      await markPaymentInitialized(orderId, result.PaymentId || '', result.PaymentURL);
      return NextResponse.json({ orderId, paymentUrl: result.PaymentURL, amountKopecks: amount });
    } catch (error) {
      await markPaymentInitFailed(orderId).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error('Manager sale creation failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Не удалось создать продажу' }, { status: 502 });
  }
}
