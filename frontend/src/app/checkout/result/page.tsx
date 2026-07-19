import Link from 'next/link';
import { getPaymentOrderNumber } from '@/lib/payment-orders';
import { applyPaymentNotification, getPaymentOrderProvider } from '@/lib/payment-orders';
import { getYandexOrderStatus, mapYandexPaymentStatus } from '@/lib/yandex-pay';

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: { success?: string; orderId?: string; provider?: string };
}) {
  const success = searchParams.success === 'true';
  if (searchParams.provider === 'yandex' && searchParams.orderId &&
      await getPaymentOrderProvider(searchParams.orderId) === 'yandex_split') {
    try {
      const remoteStatus = await getYandexOrderStatus(searchParams.orderId);
      const localStatus = mapYandexPaymentStatus(remoteStatus);
      if (localStatus) await applyPaymentNotification(searchParams.orderId, localStatus, { provider: 'yandex_split', paymentStatus: remoteStatus });
    } catch (error) {
      console.error('Yandex Pay reconciliation failed:', error);
    }
  }
  const orderNumber = searchParams.orderId
    ? await getPaymentOrderNumber(searchParams.orderId)
    : null;
  return (
    <section className="container-page py-20">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center sm:p-12">
        <div
          className={`mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl ${success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
        >
          {success ? '✓' : '!'}
        </div>
        <h1 className="mt-5 font-serif text-4xl">
          {success ? 'Платеж принят' : 'Оплата не завершена'}
        </h1>
        <p className="mt-4 text-ink/60">
          {success
            ? 'Спасибо! Подтверждаем статус платежа и свяжемся с вами для согласования доставки.'
            : 'Платеж не был выполнен. Вы можете вернуться в корзину и попробовать снова.'}
        </p>
        {orderNumber && (
          <p className="mt-3 text-sm font-medium text-ink/55">Заказ № {orderNumber}</p>
        )}
        <Link
          href={success ? '/catalog' : '/cart'}
          className="mt-7 inline-block rounded-full bg-ink px-6 py-3 text-sm text-white"
        >
          {success ? 'Вернуться в каталог' : 'Вернуться в корзину'}
        </Link>
      </div>
    </section>
  );
}
