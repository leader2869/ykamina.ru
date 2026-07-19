'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminProduct } from '@/lib/admin';
import type { PaymentOrder } from '@/lib/payment-orders';

const money = (kopecks: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(kopecks / 100);
const statusNames: Record<string, string> = {
  created: 'Создан',
  authorized: 'Оплата авторизована',
  payment_initialized: 'Ожидает оплаты',
  payment_init_failed: 'Ошибка ссылки',
  confirmed: 'Оплачен',
  cancelled: 'Отменён',
  refunded: 'Возвращён',
  reversed: 'Возвращён',
};

const websiteProcessingStatuses = new Set(['authorized', 'confirmed']);

function requiresWebsiteProcessing(order: PaymentOrder) {
  return order.source === 'website' && websiteProcessingStatuses.has(order.status);
}

export function ManagerSales({
  products,
  orders,
}: {
  products: AdminProduct[];
  orders: PaymentOrder[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    orderId: string;
    paymentUrl: string;
    amountKopecks: number;
  } | null>(null);
  const processingCount = orders.filter(requiresWebsiteProcessing).length;
  const orderedOrders = useMemo(
    () =>
      [...orders].sort(
        (left, right) =>
          Number(requiresWebsiteProcessing(right)) - Number(requiresWebsiteProcessing(left)),
      ),
    [orders],
  );
  const total = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          (products.find((product) => product.id === item.productId)?.price || 0) *
            item.quantity *
            100,
        0,
      ),
    [items, products],
  );
  const foundProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) return [];
    return products
      .filter((product) =>
        `${product.name} ${product.sku} ${product.category} ${product.parentCategory || ''}`
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 8);
  }, [productQuery, products]);

  const addProduct = (productId: string) => {
    if (!productId) return;
    setItems((current) =>
      current.some((item) => item.productId === productId)
        ? current.map((item) =>
            item.productId === productId
              ? { ...item, quantity: Math.min(10, item.quantity + 1) }
              : item,
          )
        : [...current, { productId, quantity: 1 }],
    );
    setProductQuery('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!items.length) {
      setError('Добавьте хотя бы один товар');
      return;
    }
    setSubmitting(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/manager/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          name: form.get('name'),
          phone: form.get('phone'),
          email: form.get('email'),
          city: form.get('city'),
          comment: form.get('comment'),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.paymentUrl)
        throw new Error(payload.error || 'Не удалось создать ссылку');
      setResult(payload);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать продажу');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setOpen(false);
    setResult(null);
    setItems([]);
    setProductQuery('');
    setError('');
  };
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-terracotta">
            Продажи менеджера
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-.04em]">Продажи и оплаты</h1>
          <p className="mt-3 text-sm text-black/50">
            Все заказы магазина: с сайта и созданные сотрудниками.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-terracotta px-5 py-3 text-xs font-semibold text-white transition hover:bg-[#242421]"
        >
          + Новая продажа
        </button>
      </div>
      <section className="mt-7 overflow-hidden rounded-2xl border border-black/[.07] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[.07] px-5 py-4">
          <div>
            <h2 className="font-serif text-2xl">Все заказы</h2>
            <p className="mt-1 text-[10px] text-black/40">Всего: {orders.length}</p>
          </div>
          {processingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-semibold text-amber-800">
              Требуют обработки: {processingCount}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-black/[.025] text-[9px] uppercase tracking-[.14em] text-black/35">
              <tr>
                <th className="px-5 py-3">Заказ / клиент</th>
                <th className="px-4 py-3">Товары</th>
                <th className="px-4 py-3">Сумма</th>
                <th className="px-4 py-3">Источник / статус</th>
                <th className="px-5 py-3 text-right">Ссылка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.06]">
              {orderedOrders.map((order) => {
                const needsProcessing = requiresWebsiteProcessing(order);
                return (
                <tr key={order.id} className={needsProcessing ? 'bg-amber-50/70' : undefined}>
                  <td className="px-5 py-4">
                    <p className="font-mono text-[10px] text-terracotta">
                      {order.orderNumber ? `№ ${order.orderNumber}` : 'Номер после оплаты'}
                    </p>
                    <p className="mt-1 font-semibold">{order.customerName}</p>
                    <p className="mt-1 text-[10px] text-black/40">{order.customerPhone}</p>
                  </td>
                  <td className="max-w-72 px-4 py-4 text-[10px] text-black/50">
                    {order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}
                  </td>
                  <td className="px-4 py-4 font-semibold">{money(order.amountKopecks)}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start gap-1.5">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${order.source === 'website' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'}`}>
                        {order.source === 'website' ? 'Заказ с сайта' : order.managerName || 'Продажа менеджера'}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${order.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : order.status.includes('cancel') || order.status.includes('refund') || order.status === 'reversed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}
                      >
                        {statusNames[order.status] || order.status}
                      </span>
                      {needsProcessing && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Требует обработки
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {order.paymentUrl && order.status !== 'confirmed' ? (
                      <button
                        onClick={() => navigator.clipboard.writeText(order.paymentUrl!)}
                        className="font-semibold text-terracotta hover:underline"
                      >
                        Копировать
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {orders.length === 0 && (
            <p className="py-12 text-center text-sm text-black/40">Заказов пока нет</p>
          )}
        </div>
      </section>
      {open && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="my-4 w-full max-w-3xl rounded-3xl bg-[#fbfaf8] p-5 shadow-2xl sm:p-7">
            {result ? (
              <div className="py-6 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
                  ✓
                </span>
                <h2 className="mt-5 font-serif text-3xl">Ссылка на оплату готова</h2>
                <p className="mt-2 text-sm text-black/50">Заказ на {money(result.amountKopecks)}</p>
                <div className="mx-auto mt-6 flex max-w-xl gap-2 rounded-xl border border-black/10 bg-white p-2">
                  <input
                    readOnly
                    value={result.paymentUrl}
                    className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(result.paymentUrl)}
                    className="rounded-lg bg-[#242421] px-4 py-2 text-xs font-semibold text-white"
                  >
                    Копировать
                  </button>
                </div>
                <div className="mt-5 flex justify-center gap-3">
                  <a
                    href={result.paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-black/15 px-5 py-2.5 text-xs font-semibold"
                  >
                    Открыть оплату
                  </a>
                  <button
                    onClick={close}
                    className="rounded-full bg-terracotta px-5 py-2.5 text-xs font-semibold text-white"
                  >
                    Готово
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-terracotta">
                      Новый заказ
                    </p>
                    <h2 className="mt-2 font-serif text-3xl">Продажа менеджера</h2>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    className="grid h-9 w-9 place-items-center rounded-full border border-black/10 text-xl text-black/45"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <section>
                    <h3 className="text-xs font-semibold">1. Товары</h3>
                    <div className="relative mt-3">
                      <span className="pointer-events-none absolute left-4 top-3.5 text-black/30" aria-hidden="true">⌕</span>
                      <input
                        value={productQuery}
                        onChange={(event) => setProductQuery(event.target.value)}
                        placeholder="Название, артикул или категория"
                        autoComplete="off"
                        className="w-full rounded-xl border border-black/10 bg-white py-3 pl-10 pr-4 text-xs outline-none transition focus:border-terracotta"
                      />
                      {productQuery.trim() && (
                        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-72 overflow-y-auto rounded-xl border border-black/10 bg-white p-1.5 shadow-xl">
                          {foundProducts.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => addProduct(product.id)}
                              className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left transition hover:bg-[#f4f1ec]"
                            >
                              <span className="min-w-0"><span className="block truncate text-xs font-semibold">{product.name}</span><span className="mt-1 block truncate text-[10px] text-black/40">{product.sku} · {product.category}</span></span>
                              <span className="shrink-0 text-xs font-semibold text-terracotta">{money(product.price * 100)}</span>
                            </button>
                          ))}
                          {foundProducts.length === 0 && <p className="px-3 py-6 text-center text-xs text-black/40">Товары не найдены</p>}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 space-y-2">
                      {items.map((item) => {
                        const product = products.find((entry) => entry.id === item.productId)!;
                        return (
                          <div
                            key={item.productId}
                            className="flex items-center gap-3 rounded-xl bg-white p-3 text-xs"
                          >
                            <span className="min-w-0 flex-1 truncate">{product.name}</span>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={item.quantity}
                              onChange={(event) =>
                                setItems((current) =>
                                  current.map((entry) =>
                                    entry.productId === item.productId
                                      ? {
                                          ...entry,
                                          quantity: Math.max(
                                            1,
                                            Math.min(10, Number(event.target.value)),
                                          ),
                                        }
                                      : entry,
                                  ),
                                )
                              }
                              className="w-14 rounded-lg border border-black/10 px-2 py-1.5"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setItems((current) =>
                                  current.filter((entry) => entry.productId !== item.productId),
                                )
                              }
                              className="text-red-500"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                      {!items.length && (
                        <p className="rounded-xl border border-dashed border-black/15 p-5 text-center text-xs text-black/35">
                          Добавьте товары из каталога
                        </p>
                      )}
                    </div>
                    <p className="mt-4 flex justify-between border-t border-black/10 pt-4 font-semibold">
                      <span>Итого</span>
                      <span>{money(total)}</span>
                    </p>
                  </section>
                  <section>
                    <h3 className="text-xs font-semibold">2. Клиент</h3>
                    <div className="mt-3 grid gap-3">
                      <input
                        required
                        name="name"
                        placeholder="Имя клиента"
                        className="rounded-xl border border-black/10 bg-white px-4 py-3 text-xs"
                      />
                      <input
                        required
                        name="phone"
                        type="tel"
                        placeholder="Телефон"
                        className="rounded-xl border border-black/10 bg-white px-4 py-3 text-xs"
                      />
                      <input
                        required
                        name="email"
                        type="email"
                        placeholder="Email для чека"
                        className="rounded-xl border border-black/10 bg-white px-4 py-3 text-xs"
                      />
                      <input
                        required
                        name="city"
                        placeholder="Город доставки"
                        className="rounded-xl border border-black/10 bg-white px-4 py-3 text-xs"
                      />
                      <textarea
                        name="comment"
                        placeholder="Комментарий"
                        className="min-h-20 rounded-xl border border-black/10 bg-white px-4 py-3 text-xs"
                      />
                    </div>
                  </section>
                </div>
                {error && (
                  <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">
                    {error}
                  </p>
                )}
                <button
                  disabled={submitting}
                  className="mt-6 w-full rounded-full bg-terracotta py-3.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? 'Создаём платёж…' : 'Сформировать ссылку на оплату'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
