import { randomUUID } from 'node:crypto';

type YandexCartItem = {
  productId: string;
  title: string;
  priceKopecks: number;
  quantity: number;
};

type CreateSplitOrder = {
  orderId: string;
  amountKopecks: number;
  phone: string;
  email: string;
  description: string;
  items: YandexCartItem[];
  successUrl: string;
  errorUrl: string;
};

type YandexResponse<T> = {
  status?: string;
  code?: number;
  message?: string;
  reason?: string;
  data?: T;
};

function configuration() {
  const merchantId = process.env.YANDEX_PAY_MERCHANT_ID;
  const apiKey = process.env.YANDEX_PAY_API_KEY;
  if (!merchantId || !apiKey) throw new Error('Яндекс Сплит пока не настроен');
  const sandbox = process.env.YANDEX_PAY_ENV !== 'production';
  return {
    merchantId,
    apiKey,
    baseUrl: sandbox ? 'https://sandbox.pay.yandex.ru' : 'https://pay.yandex.ru',
    sandbox,
  };
}

const rubles = (kopecks: number) => (kopecks / 100).toFixed(2);

async function yandexRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { apiKey, baseUrl } = configuration();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Request-Id': randomUUID(),
      'X-Request-Timeout': '10000',
      'X-Request-Attempt': '0',
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as YandexResponse<T>;
  if (!response.ok || !payload.data) {
    throw new Error(payload.message || payload.reason || `Яндекс Pay вернул ошибку ${response.status}`);
  }
  return payload.data;
}

export async function createYandexSplitOrder(order: CreateSplitOrder) {
  const amount = rubles(order.amountKopecks);
  const data = await yandexRequest<{ paymentUrl?: string }>('/api/merchant/v1/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderId: order.orderId,
      currencyCode: 'RUB',
      availablePaymentMethods: ['CARD', 'SPLIT'],
      preferredPaymentMethod: 'SPLIT',
      billingPhone: order.phone,
      fiscalContact: order.email,
      cart: {
        externalId: order.orderId,
        items: order.items.map((item) => ({
          productId: item.productId,
          title: item.title.slice(0, 2048),
          quantity: { count: String(item.quantity) },
          unitPrice: rubles(item.priceKopecks),
          subtotal: rubles(item.priceKopecks * item.quantity),
          total: rubles(item.priceKopecks * item.quantity),
          receipt: {
            tax: 6,
            measure: 0,
            paymentMethodType: 1,
            paymentSubjectType: 1,
          },
        })),
        total: { amount },
      },
      redirectUrls: {
        onSuccess: order.successUrl,
        onError: order.errorUrl,
        onAbort: order.errorUrl,
      },
      ttl: 1800,
      orderSource: 'WEBSITE',
      isPrepayment: false,
      purpose: order.description.slice(0, 128),
    }),
  });
  if (!data.paymentUrl) throw new Error('Яндекс Pay не вернул ссылку на оплату');
  return data.paymentUrl;
}

export async function getYandexOrderStatus(orderId: string) {
  const data = await yandexRequest<{ order?: { paymentStatus?: string } }>(
    `/api/merchant/v1/orders/${encodeURIComponent(orderId)}`,
  );
  return data.order?.paymentStatus || null;
}

export function mapYandexPaymentStatus(status: string | null | undefined) {
  switch (status?.toUpperCase()) {
    case 'CAPTURED':
    case 'CONFIRMED':
      return 'confirmed';
    case 'AUTHORIZED':
      return 'authorized';
    case 'VOIDED':
      return 'cancelled';
    case 'REFUNDED':
      return 'refunded';
    case 'PARTIALLY_REFUNDED':
      return 'partially_refunded';
    case 'FAILED':
      return 'payment_failed';
    case 'PENDING':
      return 'payment_initialized';
    default:
      return null;
  }
}

export function getYandexPayConfiguration() {
  return configuration();
}
