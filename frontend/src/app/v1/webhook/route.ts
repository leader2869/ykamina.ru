import { createRemoteJWKSet, jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { applyPaymentNotification, getPaymentOrderProvider } from '@/lib/payment-orders';
import { getYandexPayConfiguration, mapYandexPaymentStatus } from '@/lib/yandex-pay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export async function POST(request: Request) {
  try {
    const { merchantId, baseUrl } = getYandexPayConfiguration();
    const jwksUrl = `${baseUrl}/api/jwks`;
    const keySet = jwks.get(jwksUrl) || createRemoteJWKSet(new URL(jwksUrl));
    jwks.set(jwksUrl, keySet);

    const token = (await request.text()).trim();
    if (!token) return NextResponse.json({ error: 'Пустое уведомление' }, { status: 400 });
    const { payload } = await jwtVerify(token, keySet, { algorithms: ['ES256'] });
    if (payload.merchantId !== merchantId) return NextResponse.json({ error: 'Неверный магазин' }, { status: 403 });
    if (payload.event !== 'ORDER_STATUS_UPDATED') return NextResponse.json({ status: 'success' });

    const order = asRecord(payload.order);
    const orderId = String(payload.orderId || order?.orderId || '');
    const paymentStatus = String(payload.paymentStatus || order?.paymentStatus || '');
    if (!/^[0-9a-f]{32}$/i.test(orderId)) return NextResponse.json({ error: 'Неверный заказ' }, { status: 400 });
    if (await getPaymentOrderProvider(orderId) !== 'yandex_split') return NextResponse.json({ error: 'Заказ другого провайдера' }, { status: 404 });

    const status = mapYandexPaymentStatus(paymentStatus);
    if (status) await applyPaymentNotification(orderId, status, payload as Record<string, unknown>);
    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('Yandex Pay webhook failed:', error);
    return NextResponse.json({ error: 'Уведомление отклонено' }, { status: 401 });
  }
}
