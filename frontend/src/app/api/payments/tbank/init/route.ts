import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/catalog-repository';
import { initTBankPayment } from '@/lib/tbank';
import { createPaymentOrder, markPaymentInitialized, markPaymentInitFailed } from '@/lib/payment-orders';
import { buildTBankReceipt } from '@/lib/tbank-receipt';

export const dynamic = 'force-dynamic';

type RequestItem = { productId?: unknown; quantity?: unknown };

export async function POST(request: Request) {
  try {
    const body = await request.json() as { items?: RequestItem[]; name?: unknown; email?: unknown; phone?: unknown; city?: unknown; comment?: unknown };
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20) return NextResponse.json({ error: 'Корзина пуста или содержит слишком много позиций' }, { status: 400 });

    const items = body.items.map((item) => ({ productId: String(item.productId || ''), quantity: Number(item.quantity) }));
    if (items.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10)) return NextResponse.json({ error: 'Некорректный состав заказа' }, { status: 400 });

    const products = await Promise.all(items.map((item) => getProduct(item.productId)));
    if (products.some((product) => !product)) return NextResponse.json({ error: 'Один из товаров больше недоступен' }, { status: 400 });
    const amount = products.reduce((sum, product, index) => sum + Math.round(product!.price * 100) * items[index].quantity, 0);
    if (amount <= 0 || amount > 9_999_999_999) return NextResponse.json({ error: 'Некорректная сумма заказа' }, { status: 400 });

    const configuredBaseUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const baseUrl = configuredBaseUrl ? new URL(configuredBaseUrl).origin : new URL(request.url).origin;
    const orderId = randomUUID().replaceAll('-', '');
    const names = products.map((product) => product!.name).join(', ').slice(0, 120);
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 64) : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 64) : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 160) : '';
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 160) : '';
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';
    if (!name || !email || !phone || !city) return NextResponse.json({ error: 'Заполните контактные данные' }, { status: 400 });
    const storedItems = products.map((product, index) => {
      const purchaseCostKopecks = Math.round(Number(product!.availability?.wholesalePrice || 0) * 100);
      return { productId: product!.id, name: product!.name, priceKopecks: Math.round(product!.price * 100), quantity: items[index].quantity, ...(purchaseCostKopecks > 0 ? { purchaseCostKopecks } : {}) };
    });
    const receipt = buildTBankReceipt(storedItems, { email, phone });
    await createPaymentOrder({ id: orderId, amountKopecks: amount, name, email, phone, city, comment, items: storedItems, receipt });
    try {
      const result = await initTBankPayment({
        Amount: amount,
        OrderId: orderId,
        Description: `Заказ Ykamina.ru: ${names}`.slice(0, 140),
        PayType: 'O',
        Language: 'ru',
        SuccessURL: `${baseUrl}/checkout/result?success=true&orderId=${orderId}`,
        FailURL: `${baseUrl}/checkout/result?success=false&orderId=${orderId}`,
        NotificationURL: `${baseUrl}/api/payments/tbank/notification`,
        DATA: { Email: email, Phone: phone },
        Receipt: receipt,
      });
      await markPaymentInitialized(orderId, result.PaymentId || '', result.PaymentURL);
      return NextResponse.json({ paymentUrl: result.PaymentURL, paymentId: result.PaymentId, orderId });
    } catch (error) {
      await markPaymentInitFailed(orderId).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error('T-Bank payment init failed:', error);
    const message = error instanceof Error ? error.message : 'Не удалось создать платеж';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
