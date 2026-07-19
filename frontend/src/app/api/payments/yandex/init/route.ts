import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/catalog-repository';
import { createPaymentOrder, markPaymentInitialized, markPaymentInitFailed } from '@/lib/payment-orders';
import { buildTBankReceipt } from '@/lib/tbank-receipt';
import { createYandexSplitOrder } from '@/lib/yandex-pay';

export const dynamic = 'force-dynamic';

type RequestItem = { productId?: unknown; quantity?: unknown };

export async function POST(request: Request) {
  try {
    const body = await request.json() as { items?: RequestItem[]; name?: unknown; email?: unknown; phone?: unknown; city?: unknown; comment?: unknown };
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 20) return NextResponse.json({ error: 'Корзина пуста или содержит слишком много позиций' }, { status: 400 });
    const items = body.items.map((item) => ({ productId: String(item.productId || ''), quantity: Number(item.quantity) }));
    if (items.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10)) return NextResponse.json({ error: 'Некорректный состав заказа' }, { status: 400 });

    const products = await Promise.all(items.map((item) => getProduct(item.productId)));
    if (products.some((product) => !product)) return NextResponse.json({ error: 'Один из товаров больше недоступен' }, { status: 400 });
    const amount = products.reduce((sum, product, index) => sum + Math.round(product!.price * 100) * items[index].quantity, 0);
    if (amount <= 0 || amount > 9_999_999_999) return NextResponse.json({ error: 'Некорректная сумма заказа' }, { status: 400 });

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin : new URL(request.url).origin;
    const orderId = randomUUID().replaceAll('-', '');
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 64) : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 64) : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 160) : '';
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 160) : '';
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';
    if (!name || !email || !phone || !city) return NextResponse.json({ error: 'Заполните контактные данные' }, { status: 400 });

    const storedItems = products.map((product, index) => ({ productId: product!.id, name: product!.name, priceKopecks: Math.round(product!.price * 100), quantity: items[index].quantity }));
    const receipt = buildTBankReceipt(storedItems, { email, phone });
    await createPaymentOrder({ id: orderId, amountKopecks: amount, name, email, phone, city, comment, items: storedItems, receipt, paymentProvider: 'yandex_split' });
    try {
      const resultUrl = `${baseUrl}/checkout/result`;
      const paymentUrl = await createYandexSplitOrder({
        orderId,
        amountKopecks: amount,
        phone,
        email,
        description: `Заказ Ykamina.ru: ${products.map((product) => product!.name).join(', ')}`,
        items: storedItems.map((item) => ({ productId: item.productId, title: item.name, priceKopecks: item.priceKopecks, quantity: item.quantity })),
        successUrl: `${resultUrl}?success=true&provider=yandex&orderId=${orderId}`,
        errorUrl: `${resultUrl}?success=false&provider=yandex&orderId=${orderId}`,
      });
      await markPaymentInitialized(orderId, null, paymentUrl);
      return NextResponse.json({ paymentUrl, orderId });
    } catch (error) {
      await markPaymentInitFailed(orderId).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error('Yandex Split payment init failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Не удалось создать платеж' }, { status: 502 });
  }
}
