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

type SaleItem = {
  productId: string;
  quantity: number;
  salePriceRubles: number;
  purchaseCostRubles: number | null;
  purchaseCostFromCatalog: boolean;
};

function requiresWebsiteProcessing(order: PaymentOrder) {
  return order.source === 'website' && !order.managerUserId && websiteProcessingStatuses.has(order.status);
}

export function ManagerSales({
  products,
  orders,
  managerUserId,
  query = '',
  onQueryChange,
}: {
  products: AdminProduct[];
  orders: PaymentOrder[];
  managerUserId: string;
  query?: string;
  onQueryChange?: (query: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [items, setItems] = useState<SaleItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [claimingOrderId, setClaimingOrderId] = useState('');
  const [cancellingOrderId, setCancellingOrderId] = useState('');
  const [syncingOrderId, setSyncingOrderId] = useState('');
  const [result, setResult] = useState<{
    orderId: string;
    paymentUrl: string;
    amountKopecks: number;
  } | null>(null);
  const managerOrders = useMemo(
    () => orders.filter((order) => order.managerUserId === managerUserId || requiresWebsiteProcessing(order)),
    [managerUserId, orders],
  );
  const processingCount = managerOrders.filter(requiresWebsiteProcessing).length;
  const orderedOrders = useMemo(
    () =>
      [...managerOrders].sort(
        (left, right) =>
          Number(requiresWebsiteProcessing(right)) - Number(requiresWebsiteProcessing(left)),
      ),
    [managerOrders],
  );
  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orderedOrders.filter((order) => {
      const haystack = `${order.orderNumber || ''} ${order.customerName} ${order.customerPhone} ${order.customerEmail} ${order.items.map((item) => item.name).join(' ')}`.toLowerCase();
      const matchesQuery = !normalized || haystack.includes(normalized);
      const matchesSource = sourceFilter === 'all' || order.source === sourceFilter;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'paid' && order.status === 'confirmed')
        || (statusFilter === 'waiting' && ['created', 'payment_initialized', 'authorized'].includes(order.status))
        || (statusFilter === 'problem' && ['payment_init_failed', 'payment_failed', 'cancelled', 'refunded', 'reversed'].includes(order.status));
      return matchesQuery && matchesSource && matchesStatus;
    });
  }, [orderedOrders, query, sourceFilter, statusFilter]);
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.salePriceRubles * item.quantity * 100, 0),
    [items],
  );
  const totalCost = useMemo(
    () => items.reduce((sum, item) => sum + (item.purchaseCostRubles || 0) * item.quantity * 100, 0),
    [items],
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
    const product = products.find((entry) => entry.id === productId);
    if (!product) return;
    const catalogCost = Number(product.availability?.wholesalePrice || 0);
    setItems((current) =>
      current.some((item) => item.productId === productId)
        ? current.map((item) =>
            item.productId === productId
              ? { ...item, quantity: Math.min(10, item.quantity + 1) }
              : item,
          )
        : [...current, {
            productId,
            quantity: 1,
            salePriceRubles: product.price,
            purchaseCostRubles: catalogCost > 0 ? catalogCost : null,
            purchaseCostFromCatalog: catalogCost > 0,
          }],
    );
    setProductQuery('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!items.length) {
      setError('Добавьте хотя бы один товар');
      return;
    }
    const invalidCost = items.find((item) => !item.purchaseCostRubles || item.purchaseCostRubles <= 0);
    if (invalidCost) {
      setError('Укажите закупочную стоимость для каждого товара');
      return;
    }
    const invalidPrice = items.find((item) => item.salePriceRubles < (item.purchaseCostRubles || 0));
    if (invalidPrice) {
      setError('Цена продажи не может быть ниже закупочной стоимости');
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
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            salePriceKopecks: Math.round(item.salePriceRubles * 100),
            purchaseCostKopecks: Math.round((item.purchaseCostRubles || 0) * 100),
          })),
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
  const claimWebsiteOrder = async (orderId: string) => {
    setClaimingOrderId(orderId);
    setError('');
    try {
      const response = await fetch('/api/manager/sales', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось закрепить заказ');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось закрепить заказ');
    } finally {
      setClaimingOrderId('');
    }
  };
  const cancelOrder = async (orderId: string) => {
    setCancellingOrderId(orderId);
    setError('');
    try {
      const response = await fetch('/api/manager/sales', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, action: 'cancel' }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось отменить оплату');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отменить оплату');
    } finally {
      setCancellingOrderId('');
    }
  };
  const syncOrderPayment = async (orderId: string) => {
    setSyncingOrderId(orderId);
    setError('');
    try {
      const response = await fetch('/api/manager/sales', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, action: 'sync' }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось проверить оплату');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить оплату');
    } finally {
      setSyncingOrderId('');
    }
  };
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4"><h1 className="font-serif text-4xl tracking-[-.04em]">Продажи и платежи</h1>{onQueryChange && <div className="relative min-w-60 flex-1"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/30">⌕</span><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Поиск по заказам и клиентам" className="w-full rounded-full border border-black/10 bg-white py-3 pl-10 pr-4 text-xs outline-none focus:border-terracotta"/></div>}</div>
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
            <p className="mt-1 text-[10px] text-black/40">Всего: {managerOrders.length}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="rounded-full border border-black/10 bg-white px-3 py-2 text-[10px]"><option value="all">Все источники</option><option value="website">Сайт</option><option value="manager">Менеджеры</option></select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-full border border-black/10 bg-white px-3 py-2 text-[10px]"><option value="all">Все статусы</option><option value="paid">Оплачено</option><option value="waiting">Ожидают оплаты</option><option value="problem">Ошибки и отмены</option></select>
          {processingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-semibold text-amber-800">
              Требуют обработки: {processingCount}
            </span>
          )}
          </div>
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
              {visibleOrders.map((order) => {
                const needsProcessing = requiresWebsiteProcessing(order);
                return (
                <tr key={order.id} className={needsProcessing ? 'bg-amber-50/70' : undefined}>
                  <td className="px-5 py-4">
                    <p className="font-mono text-[10px] text-terracotta">
                      {order.orderNumber ? `№ ${order.orderNumber}` : 'Номер после оплаты'}
                    </p>
                    <p className="mt-1 font-semibold">{order.customerName}</p>
                    <p className="mt-1 text-[10px] text-black/40">{order.customerPhone}</p>
                    <p className="mt-1 text-[10px] text-black/35">{order.customerEmail}</p>
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
                      <span className="text-[9px] text-black/35">{order.paymentProvider === 'yandex_split' ? 'Яндекс Сплит' : 'Т-Банк'} · {new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt))}</span>
                      {needsProcessing && (
                        <button disabled={claimingOrderId === order.id} onClick={() => claimWebsiteOrder(order.id)} className="rounded-full bg-amber-500 px-2.5 py-1 text-[9px] font-bold text-white disabled:opacity-50">
                          {claimingOrderId === order.id ? 'Закрепляем…' : 'Взять в работу'}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-3">
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
                    {order.managerUserId === managerUserId && !['confirmed', 'cancelled', 'canceled', 'reversed', 'refunded', 'cancellation_pending'].includes(order.status) && (
                      <button disabled={syncingOrderId === order.id} onClick={() => syncOrderPayment(order.id)} className="font-semibold text-black/55 hover:text-black disabled:opacity-50">
                        {syncingOrderId === order.id ? 'Проверяем…' : 'Проверить'}
                      </button>
                    )}
                    {order.managerUserId === managerUserId && !['cancelled', 'canceled', 'reversed', 'refunded', 'cancellation_pending'].includes(order.status) && (
                      <button disabled={cancellingOrderId === order.id} onClick={() => cancelOrder(order.id)} className="font-semibold text-red-600 hover:underline disabled:opacity-50">
                        {cancellingOrderId === order.id ? 'Обрабатываем…' : order.status === 'confirmed' ? 'Возврат' : 'Отменить'}
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {visibleOrders.length === 0 && (
            <p className="py-12 text-center text-sm text-black/40">{managerOrders.length ? 'По выбранным условиям платежей нет' : 'У вас пока нет продаж и заказов в работе'}</p>
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
                          <div key={item.productId} className="rounded-xl bg-white p-3 text-xs">
                            <div className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">{product.name}</p>
                                <p className="mt-1 text-[10px] text-black/40">Цена по каталогу: {money(product.price * 100)}</p>
                              </div>
                              <button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.productId !== item.productId))} className="text-red-500">×</button>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              <label className="text-[9px] text-black/45">Количество
                                <input type="number" min="1" max="10" value={item.quantity} onChange={(event) => setItems((current) => current.map((entry) => entry.productId === item.productId ? { ...entry, quantity: Math.max(1, Math.min(10, Number(event.target.value))) } : entry))} className="mt-1 w-full rounded-lg border border-black/10 px-2 py-2 text-xs" />
                              </label>
                              <label className="text-[9px] text-black/45">Цена продажи, ₽
                                <input type="number" min={item.purchaseCostRubles || 1} max={product.price} step="1" value={item.salePriceRubles} onChange={(event) => setItems((current) => current.map((entry) => entry.productId === item.productId ? { ...entry, salePriceRubles: Math.max(0, Number(event.target.value)) } : entry))} className="mt-1 w-full rounded-lg border border-black/10 px-2 py-2 text-xs" />
                              </label>
                              <label className="text-[9px] text-black/45">Закупка, ₽
                                <input required type="number" min="1" step="1" disabled={item.purchaseCostFromCatalog} value={item.purchaseCostRubles ?? ''} placeholder="Обязательно" onChange={(event) => setItems((current) => current.map((entry) => entry.productId === item.productId ? { ...entry, purchaseCostRubles: event.target.value ? Math.max(0, Number(event.target.value)) : null } : entry))} className={`mt-1 w-full rounded-lg border px-2 py-2 text-xs ${item.purchaseCostRubles ? 'border-black/10' : 'border-red-300 bg-red-50'} disabled:bg-black/[.04]`} />
                              </label>
                            </div>
                            <div className="mt-2 flex justify-between text-[10px]">
                              <span className="text-terracotta">Скидка: {money(Math.max(0, product.price - item.salePriceRubles) * item.quantity * 100)}</span>
                              <span className="font-semibold text-emerald-700">Прибыль: {money(Math.max(0, item.salePriceRubles - (item.purchaseCostRubles || 0)) * item.quantity * 100)}</span>
                            </div>
                            {!item.purchaseCostRubles && <p className="mt-2 text-[10px] font-semibold text-red-600">В каталоге нет закупочной цены — заполните её</p>}
                            {item.purchaseCostRubles && item.salePriceRubles < item.purchaseCostRubles && <p className="mt-2 text-[10px] font-semibold text-red-600">Цена продажи ниже закупочной</p>}
                          </div>
                        );
                      })}
                      {!items.length && (
                        <p className="rounded-xl border border-dashed border-black/15 p-5 text-center text-xs text-black/35">
                          Добавьте товары из каталога
                        </p>
                      )}
                    </div>
                    <div className="mt-4 space-y-1 border-t border-black/10 pt-4 text-xs">
                      <p className="flex justify-between"><span>Себестоимость</span><span>{money(totalCost)}</span></p>
                      <p className="flex justify-between font-semibold text-emerald-700"><span>Валовая прибыль</span><span>{money(Math.max(0, total - totalCost))}</span></p>
                      <p className="flex justify-between pt-1 font-semibold"><span>Итого клиенту</span><span>{money(total)}</span></p>
                    </div>
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
