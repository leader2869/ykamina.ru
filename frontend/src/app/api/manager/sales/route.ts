import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getProduct } from '@/lib/catalog-repository';
import { applyPaymentNotification, createPaymentOrder, markPaymentInitialized, markPaymentInitFailed } from '@/lib/payment-orders';
import { cancelTBankPayment, getTBankPaymentState, initTBankPayment } from '@/lib/tbank';
import { buildTBankReceipt } from '@/lib/tbank-receipt';
import { getManagerCrmPool } from '@/lib/manager-crm';

export const dynamic = 'force-dynamic';

type RequestItem = {
  productId?: unknown;
  quantity?: unknown;
  salePriceKopecks?: unknown;
  purchaseCostKopecks?: unknown;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
  if (user.role !== 'sales_manager' && user.role !== 'super_admin') return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });

  try {
    const body = await request.json() as { items?: RequestItem[]; name?: unknown; email?: unknown; phone?: unknown; city?: unknown; comment?: unknown };
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20) return NextResponse.json({ error: 'Добавьте от 1 до 20 товаров' }, { status: 400 });
    const items = body.items.map((item) => ({
      productId: String(item.productId || ''),
      quantity: Number(item.quantity),
      salePriceKopecks: Number(item.salePriceKopecks),
      purchaseCostKopecks: Number(item.purchaseCostKopecks),
    }));
    if (items.some((item) => !/^\d+$/.test(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10 || !Number.isInteger(item.salePriceKopecks) || item.salePriceKopecks <= 0)) return NextResponse.json({ error: 'Некорректный состав заказа' }, { status: 400 });

    const products = await Promise.all(items.map((item) => getProduct(item.productId, true)));
    if (products.some((product) => !product)) return NextResponse.json({ error: 'Один из товаров не найден' }, { status: 400 });
    const pricedItems = products.map((product, index) => {
      const requested = items[index];
      const listPriceKopecks = Math.round(product!.price * 100);
      const catalogCostKopecks = Math.round(Number(product!.availability?.wholesalePrice || 0) * 100);
      const purchaseCostKopecks = catalogCostKopecks > 0 ? catalogCostKopecks : requested.purchaseCostKopecks;
      if (!Number.isInteger(purchaseCostKopecks) || purchaseCostKopecks <= 0) throw new Error(`Укажите закупочную стоимость товара «${product!.name}»`);
      if (requested.salePriceKopecks > listPriceKopecks) throw new Error(`Цена товара «${product!.name}» не может быть выше цены по каталогу`);
      if (requested.salePriceKopecks < purchaseCostKopecks) throw new Error(`Скидка на товар «${product!.name}» опускает цену ниже себестоимости`);
      return {
        productId: product!.id,
        name: product!.name,
        priceKopecks: requested.salePriceKopecks,
        listPriceKopecks,
        purchaseCostKopecks,
        discountKopecks: listPriceKopecks - requested.salePriceKopecks,
        quantity: requested.quantity,
      };
    });
    const amount = pricedItems.reduce((sum, item) => sum + item.priceKopecks * item.quantity, 0);
    const purchaseCost = pricedItems.reduce((sum, item) => sum + item.purchaseCostKopecks * item.quantity, 0);
    if (amount <= 0 || amount > 9_999_999_999) return NextResponse.json({ error: 'Некорректная сумма продажи' }, { status: 400 });

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 160) : '';
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 64) : '';
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 160) : '';
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';
    if (!name || !email || !phone || !city) return NextResponse.json({ error: 'Заполните данные клиента' }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Укажите корректный email' }, { status: 400 });

    const orderId = randomUUID().replaceAll('-', '');
    const storedItems = pricedItems;
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
      const costColumn = await crm.query<{ exists: boolean }>(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_deals' AND column_name='purchase_cost_kopecks') AS exists`);
      const deal = costColumn.rows[0]?.exists
        ? await crm.query<{ id: string }>(`INSERT INTO sales_deals (manager_user_id,client_id,title,stage,amount_kopecks,purchase_cost_kopecks,probability,product_interest,notes) VALUES ($1,$2,$3,'awaiting_payment',$4,$5,70,$6,$7) RETURNING id`, [user.id, salesClientId, `Продажа: ${storedItems[0].name}`.slice(0, 240), amount, purchaseCost, storedItems.map((item) => item.name).join(', '), comment || null])
        : await crm.query<{ id: string }>(`INSERT INTO sales_deals (manager_user_id,client_id,title,stage,amount_kopecks,probability,product_interest,notes) VALUES ($1,$2,$3,'awaiting_payment',$4,70,$5,$6) RETURNING id`, [user.id, salesClientId, `Продажа: ${storedItems[0].name}`.slice(0, 240), amount, storedItems.map((item) => item.name).join(', '), comment || null]);
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

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
  if (user.role !== 'sales_manager' && user.role !== 'super_admin') return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
  try {
    const body = await request.json() as { orderId?: unknown; action?: unknown };
    const orderId = String(body.orderId || '');
    if (!/^[0-9a-f-]{32,36}$/i.test(orderId)) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    if (body.action === 'sync') {
      const crm = getManagerCrmPool();
      const order = await crm.query<{ tbank_payment_id: string | null }>(
        `SELECT tbank_payment_id FROM payment_orders WHERE id=$1::uuid AND manager_user_id=$2 LIMIT 1`,
        [orderId, user.id],
      );
      if (!order.rows[0]) return NextResponse.json({ error: 'Продажа не найдена' }, { status: 404 });
      if (!order.rows[0].tbank_payment_id) return NextResponse.json({ error: 'Ссылка на оплату ещё не создана' }, { status: 400 });
      const state = await getTBankPaymentState(order.rows[0].tbank_payment_id);
      if (!state.Status) return NextResponse.json({ error: 'Банк не вернул статус оплаты' }, { status: 502 });
      await applyPaymentNotification(orderId, state.Status, state as unknown as Record<string, unknown>);
      return NextResponse.json({ ok: true, status: state.Status });
    }
    if (body.action === 'cancel') {
      const crm = getManagerCrmPool();
      const order = await crm.query<{ status: string; tbank_payment_id: string | null }>(
        `SELECT status,tbank_payment_id FROM payment_orders
         WHERE id=$1::uuid AND manager_user_id=$2 LIMIT 1`,
        [orderId, user.id],
      );
      const sale = order.rows[0];
      if (!sale) return NextResponse.json({ error: 'Продажа не найдена' }, { status: 404 });
      if (['cancelled', 'canceled', 'reversed', 'refunded'].includes(sale.status)) return NextResponse.json({ ok: true });
      const reason = sale.status === 'confirmed' ? 'Возврат средств по запросу менеджера' : 'Отменено менеджером';
      if (!sale.tbank_payment_id) {
        await crm.query(`UPDATE payment_orders SET status='cancelled',cancellation_reason=$1,cancelled_at=NOW(),updated_at=NOW() WHERE id=$2::uuid`, [reason, orderId]);
        if (sale.status === 'confirmed') await crm.query(`UPDATE sales_deals d SET stage='lost',probability=0,closed_at=NOW(),updated_at=NOW() FROM payment_orders o WHERE o.id=$1::uuid AND o.sales_deal_id=d.id AND d.stage='won'`, [orderId]);
        return NextResponse.json({ ok: true });
      }
      await crm.query(`UPDATE payment_orders SET status='cancellation_pending',cancellation_reason=$1,cancellation_requested_at=NOW(),updated_at=NOW() WHERE id=$2::uuid`, [reason, orderId]);
      try {
        const result = await cancelTBankPayment(sale.tbank_payment_id);
        const nextStatus = (result.Status || 'cancelled').toLowerCase();
        await crm.query(`UPDATE payment_orders SET status=$1,cancelled_at=NOW(),cancellation_response=$2::jsonb,updated_at=NOW() WHERE id=$3::uuid`, [nextStatus, JSON.stringify(result), orderId]);
        if (sale.status === 'confirmed' && ['cancelled', 'canceled', 'reversed', 'refunded'].includes(nextStatus)) {
          await crm.query(`UPDATE sales_deals d SET stage='lost',probability=0,closed_at=NOW(),updated_at=NOW() FROM payment_orders o WHERE o.id=$1::uuid AND o.sales_deal_id=d.id AND d.stage='won'`, [orderId]);
        }
        return NextResponse.json({ ok: true });
      } catch (error) {
        await crm.query(`UPDATE payment_orders SET status=$1,updated_at=NOW() WHERE id=$2::uuid`, [sale.status, orderId]);
        throw error;
      }
    }
    const result = await getManagerCrmPool().query<{ id: string }>(
      `UPDATE payment_orders
       SET manager_user_id=$1, updated_at=NOW()
       WHERE id=$2::uuid AND source='website' AND manager_user_id IS NULL
       RETURNING id`,
      [user.id, orderId],
    );
    if (!result.rows[0]) return NextResponse.json({ error: 'Этот заказ уже взял в работу другой менеджер' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Website order assignment failed:', error);
    return NextResponse.json({ error: 'Не удалось закрепить заказ' }, { status: 500 });
  }
}
