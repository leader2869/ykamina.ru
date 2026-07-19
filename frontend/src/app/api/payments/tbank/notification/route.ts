import { timingSafeEqual } from 'node:crypto';
import { createTBankToken } from '@/lib/tbank';
import { applyPaymentNotification } from '@/lib/payment-orders';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const password = process.env.TBANK_PASSWORD;
  if (!password) return new Response('Terminal is not configured', { status: 503 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const received = typeof payload.Token === 'string' ? payload.Token : '';
    const expected = createTBankToken(payload, password);
    const valid = received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
    if (!valid) return new Response('Invalid token', { status: 403 });

    const { Token: _token, ...safePayload } = payload;
    const orderId = typeof payload.OrderId === 'string' ? payload.OrderId : '';
    const status = typeof payload.Status === 'string' ? payload.Status : '';
    if (!orderId || !status) return new Response('Invalid notification', { status: 400 });
    await applyPaymentNotification(orderId, status, safePayload);
    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch (error) {
    console.error('T-Bank notification processing failed:', error);
    return new Response('Invalid request', { status: 400 });
  }
}
