'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminProduct } from '@/lib/admin';
import type { ManagerWorkspace, SalesClient, SalesDeal, SalesTask } from '@/lib/manager-crm';
import type { PaymentOrder } from '@/lib/payment-orders';

const money = (kopecks: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(kopecks / 100);
const catalogMoney = (rubles: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(rubles);
const dateTime = (value: string | null) => {
  if (!value) return 'Не указан';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return `${part('day')}.${part('month')} ${part('hour')}:${part('minute')}`;
};
const stageNames: Record<string, string> = {
  new: 'Новая',
  qualification: 'Квалификация',
  proposal: 'Предложение',
  negotiation: 'Согласование',
  awaiting_payment: 'Ожидает оплаты',
  won: 'Успешно',
  lost: 'Отказ',
};
const stages = Object.entries(stageNames);
const pipelineStages = stages.filter(([stage]) => stage !== 'qualification');
const sourceNames: Record<string, string> = {
  manager: 'Менеджер',
  website: 'Сайт',
  phone: 'Звонок',
  messenger: 'Мессенджер',
  recommendation: 'Рекомендация',
  other: 'Другое',
};
const priorityNames: Record<string, string> = { low: 'Низкий', normal: 'Обычный', high: 'Высокий' };
const taskStatusNames: Record<string, string> = {
  open: 'Открыта',
  done: 'Выполнена',
  cancelled: 'Отменена',
};

async function request(body: Record<string, unknown>, method = 'POST') {
  const response = await fetch('/api/manager/crm', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить изменения');
  return payload as Record<string, unknown>;
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="my-5 w-full max-w-2xl overflow-x-hidden rounded-3xl bg-[#fbfaf8] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-terracotta">
              {subtitle}
            </p>
            <h2 className="mt-2 font-serif text-3xl">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-black/10 text-xl text-black/45"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DealProducts({
  products,
  compatibilities,
  initialNames = '',
  initialAmount = 0,
}: {
  products: AdminProduct[];
  compatibilities: Record<string, string[]>;
  initialNames?: string;
  initialAmount?: number;
}) {
  const initialIds = products
    .filter((product) => initialNames.split(' · ').includes(product.name))
    .map((product) => product.id);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [discount, setDiscount] = useState(0);
  const [productQuery, setProductQuery] = useState('');
  const [productsEdited, setProductsEdited] = useState(false);
  const [purchaseCosts, setPurchaseCosts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialIds.map((id) => [id, String(products.find((product) => product.id === id)?.availability?.wholesalePrice || '')])),
  );
  const selectedProducts = products.filter((product) => selectedIds.includes(product.id));
  const matchingProducts = products
    .filter((product) => !selectedIds.includes(product.id))
    .filter((product) => productQuery.trim() && `${product.name} ${product.sku}`.toLowerCase().includes(productQuery.trim().toLowerCase()))
    .slice(0, 8);
  const compatiblePortals = products.filter((product) =>
    selectedIds.some((id) => compatibilities[id]?.includes(product.id)) && !selectedIds.includes(product.id),
  );
  const catalogTotal = selectedProducts.reduce((sum, product) => sum + product.price, 0);
  const totalBeforeDiscount = selectedProducts.length > 0 ? catalogTotal : productsEdited ? 0 : initialAmount;
  const total = Math.max(0, Math.round(totalBeforeDiscount * (1 - discount / 100)));
  const purchaseTotal = selectedProducts.reduce((sum, product) => sum + Number(purchaseCosts[product.id] || 0), 0);
  const missingPurchaseCost = discount > 0 && selectedProducts.some((product) => Number(purchaseCosts[product.id]) <= 0);
  const belowPurchaseCost = discount > 0 && !missingPurchaseCost && total < purchaseTotal;
  const input = 'w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-xs outline-none focus:border-terracotta';
  return (
    <section className="rounded-2xl border border-black/[.07] bg-[#f4f1ec] p-4">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-black/45">Товары в заявке</p><p className="mt-1 text-[10px] text-black/40">Добавьте нужные позиции из каталога</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-black/45">{selectedProducts.length} шт.</span></div>
      <div className="relative mt-3"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/30">⌕</span><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Поиск по названию или артикулу" className={`${input} pl-9`} /></div>
      {productQuery.trim() && <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-black/[.07] bg-white p-1.5">
        {matchingProducts.map((product) => (
          <button key={product.id} type="button" onClick={() => { setSelectedIds((current) => [...current, product.id]); setProductsEdited(true); setPurchaseCosts((current) => ({ ...current, [product.id]: String(product.availability?.wholesalePrice || '') })); setProductQuery(''); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-terracotta/10">
            <span className="h-9 w-9 shrink-0 rounded-lg bg-cover bg-center bg-black/[.05]" style={product.image ? { backgroundImage: `url(${product.image})` } : undefined} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{product.name}</span><span className="whitespace-nowrap text-[10px] text-black/50">{catalogMoney(product.price)}</span><span className="text-base text-terracotta">+</span>
          </button>
        ))}
        {matchingProducts.length === 0 && <p className="px-2 py-3 text-center text-[10px] text-black/40">Ничего не найдено</p>}
      </div>}
      {compatiblePortals.length > 0 && (
        <div className="mt-3 rounded-xl border border-terracotta/20 bg-white p-3">
          <p className="text-[10px] font-semibold text-terracotta">Подходящие порталы для выбранного электроочага</p>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
            {compatiblePortals.map((product) => (
              <button key={product.id} type="button" onClick={() => { setSelectedIds((current) => [...current, product.id]); setProductsEdited(true); setPurchaseCosts((current) => ({ ...current, [product.id]: String(product.availability?.wholesalePrice || '') })); }} className="flex w-full min-w-0 items-center gap-3 rounded-lg px-1 py-1.5 text-left transition hover:bg-terracotta/10">
                <span className="h-8 w-8 shrink-0 rounded-md bg-cover bg-center bg-black/[.05]" style={product.image ? { backgroundImage: `url(${product.image})` } : undefined} aria-hidden />
                <span className="min-w-0 flex-1 whitespace-normal break-words text-xs leading-4">{product.name}</span><span className="shrink-0 text-[10px] text-black/50">{catalogMoney(product.price)}</span><span className="shrink-0 text-terracotta">+</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {selectedProducts.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {selectedProducts.map((product) => (
            <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs">
              <span className="h-8 w-8 shrink-0 rounded-md bg-cover bg-center bg-black/[.05]" style={product.image ? { backgroundImage: `url(${product.image})` } : undefined} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{product.name}</span>
              <strong className="whitespace-nowrap">{catalogMoney(product.price)}</strong>
              <button type="button" onClick={() => { setSelectedIds((current) => current.filter((id) => id !== product.id)); setProductsEdited(true); }} className="text-black/35 hover:text-red-600">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-[.8fr_1.2fr]">
        <label className="rounded-xl bg-white px-3 py-2 text-[10px] text-black/45">Скидка, %<input type="number" min="0" max="100" value={discount || ''} onChange={(event) => setDiscount(Math.min(100, Math.max(0, Number(event.target.value))))} placeholder="0" className="mt-1 w-full border-0 bg-transparent p-0 text-lg font-semibold text-black outline-none" /></label>
        <div className="rounded-xl bg-ink px-4 py-3 text-white"><p className="text-[9px] text-white/50">Итого для клиента</p><p className="mt-1 text-base font-semibold">{catalogMoney(total)}</p></div>
      </div>
      {discount > 0 && selectedProducts.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[10px] font-semibold text-amber-900">Для скидки укажите закупочную цену каждой позиции</p>
          <div className="mt-2 space-y-2">
            {selectedProducts.map((product) => (
              <label key={product.id} className="flex items-center gap-3 text-[10px] text-black/60">
                <span className="min-w-0 flex-1 truncate">{product.name}</span>
                <input type="number" min="1" step="1" value={purchaseCosts[product.id] || ''} onChange={(event) => setPurchaseCosts((current) => ({ ...current, [product.id]: event.target.value }))} placeholder="Закупка, ₽" className="w-28 rounded-lg border border-amber-200 bg-white px-2 py-2 text-xs outline-none" />
              </label>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-amber-900">Общая закупка: {catalogMoney(purchaseTotal)}</p>
          {missingPurchaseCost && <p className="mt-1 text-[10px] font-semibold text-red-700">Заполните закупочную цену для всех выбранных товаров.</p>}
          {belowPurchaseCost && <p className="mt-1 text-[10px] font-semibold text-red-700">Итог со скидкой не может быть ниже закупочной стоимости.</p>}
        </div>
      )}
      <input type="hidden" name="productInterest" value={selectedProducts.map((product) => product.name).join(' · ')} />
      <input type="hidden" name="amount" value={total} />
      <input type="hidden" name="discount" value={discount} />
      <input type="hidden" name="purchaseCost" value={purchaseTotal || ''} />
    </section>
  );
}

function CrmForm({
  kind,
  workspace,
  products,
  compatibilities,
  onClose,
}: {
  kind: 'client' | 'deal' | 'task' | 'activity';
  workspace: ManagerWorkspace;
  products: AdminProduct[];
  compatibilities: Record<string, string[]>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const matchingClients = useMemo(() => {
    const query = clientQuery.trim().toLowerCase();
    if (!query) return workspace.clients;
    return workspace.clients.filter((client) =>
      `${client.fullName} ${client.phone || ''} ${client.email || ''}`
        .toLowerCase()
        .includes(query),
    );
  }, [clientQuery, workspace.clients]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (kind === 'deal' && creatingClient) {
        const client = await request({
          entity: 'client',
          fullName: data.newClientFullName,
          phone: data.newClientPhone,
          email: data.newClientEmail,
          city: data.newClientCity,
          source: 'manager',
        });
        data.clientId = String(client.id || '');
      }
      await request({ entity: kind, ...data });
      router.refresh();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };
  const input =
    'w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-xs outline-none focus:border-terracotta';
  const titles = {
    client: ['Новый клиент', 'Клиентская база'],
    deal: ['Новая сделка', 'Воронка продаж'],
    task: ['Новая задача', 'Планирование'],
    activity: ['Новая заметка', 'История контактов'],
  } as const;
  return (
    <Modal title={titles[kind][0]} subtitle={titles[kind][1]} onClose={onClose}>
      <form onSubmit={submit} className="mt-6 grid gap-3">
        {kind === 'client' && (
          <>
            <input required name="fullName" placeholder="Имя клиента" className={input} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="phone" placeholder="Телефон" className={input} />
              <input name="email" type="email" placeholder="Email" className={input} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="city" placeholder="Адрес доставки" className={input} />
              <select name="source" className={input}>
                <option value="manager">Добавлен менеджером</option>
                <option value="website">Сайт</option>
                <option value="phone">Входящий звонок</option>
                <option value="messenger">Мессенджер</option>
                <option value="recommendation">Рекомендация</option>
                <option value="other">Другое</option>
              </select>
            </div>
            <textarea
              name="notes"
              placeholder="Что важно знать о клиенте"
              className={`${input} min-h-24`}
            />
            <label className="text-[10px] text-black/45">
              Следующий контакт
              <input name="nextContactAt" type="datetime-local" className={`mt-1.5 ${input}`} />
            </label>
          </>
        )}
        {kind === 'deal' && (
          <>
            <section className="rounded-2xl border border-black/[.07] bg-[#f4f1ec] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-black/45">
                    Клиент сделки
                  </p>
                  <p className="mt-1 text-[9px] text-black/35">
                    Найдите клиента или создайте нового
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreatingClient((value) => !value)}
                  className="shrink-0 rounded-full bg-ink px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-terracotta"
                >
                  {creatingClient ? 'Выбрать из базы' : '+ Новый клиент'}
                </button>
              </div>
              {creatingClient ? (
                <div className="mt-4 grid gap-3">
                  <input
                    required
                    name="newClientFullName"
                    placeholder="Имя нового клиента"
                    className={input}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      required
                      name="newClientPhone"
                      type="tel"
                      placeholder="Телефон"
                      className={input}
                    />
                    <input
                      name="newClientEmail"
                      type="email"
                      placeholder="Email"
                      className={input}
                    />
                  </div>
                  <input name="newClientCity" placeholder="Адрес доставки" className={input} />
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  <input
                    value={clientQuery}
                    onChange={(event) => setClientQuery(event.target.value)}
                    placeholder="Поиск по имени, телефону или email"
                    className={input}
                  />
                  <select required name="clientId" className={input}>
                    <option value="">Выберите клиента</option>
                    {matchingClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.fullName} · {client.phone || client.email}
                      </option>
                    ))}
                  </select>
                  {matchingClients.length === 0 && (
                    <p className="text-[10px] text-terracotta">
                      Клиент не найден — добавьте нового кнопкой выше.
                    </p>
                  )}
                </div>
              )}
            </section>
            <input required name="title" placeholder="Название сделки" className={input} />
            <DealProducts products={products} compatibilities={compatibilities} />
            <input type="hidden" name="probability" value="20" />
            <label className="text-[10px] text-black/45">
              Следующий контакт
              <input name="nextContactAt" type="datetime-local" className={`mt-1.5 ${input}`} />
            </label>
            <textarea
              name="notes"
              placeholder="Комментарий к сделке"
              className={`${input} min-h-24`}
            />
          </>
        )}
        {kind === 'task' && (
          <>
            <input required name="title" placeholder="Что нужно сделать" className={input} />
            <textarea
              name="description"
              placeholder="Описание или результат, который нужен"
              className={`${input} min-h-20`}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[10px] text-black/45">
                Срок
                <input required name="dueAt" type="datetime-local" className={`mt-1.5 ${input}`} />
              </label>
              <label className="text-[10px] text-black/45">
                Приоритет
                <select name="priority" defaultValue="normal" className={`mt-1.5 ${input}`}>
                  <option value="low">Низкий</option>
                  <option value="normal">Обычный</option>
                  <option value="high">Высокий</option>
                </select>
              </label>
            </div>
            <select name="clientId" className={input}>
              <option value="">Без привязки к клиенту</option>
              {workspace.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.fullName}
                </option>
              ))}
            </select>
            <select name="dealId" className={input}>
              <option value="">Без привязки к сделке</option>
              {workspace.deals
                .filter((deal) => !['won', 'lost'].includes(deal.stage))
                .map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.title} · {deal.clientName}
                  </option>
                ))}
            </select>
          </>
        )}
        {kind === 'activity' && (
          <>
            <select name="clientId" className={input}>
              <option value="">Выберите клиента</option>
              {workspace.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.fullName}
                </option>
              ))}
            </select>
            <select name="dealId" className={input}>
              <option value="">Или выберите сделку</option>
              {workspace.deals.map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {deal.title} · {deal.clientName}
                </option>
              ))}
            </select>
            <textarea
              required
              name="description"
              placeholder="Итог звонка, договорённость или важная заметка"
              className={`${input} min-h-28`}
            />
          </>
        )}
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
        <button
          disabled={saving}
          className="mt-2 rounded-full bg-terracotta py-3.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>
    </Modal>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-white/45 px-6 py-12 text-center text-sm text-black/40">
      {children}
    </div>
  );
}

function DealDetailsForm({
  deal,
  products,
  compatibilities,
  onClose,
}: {
  deal: SalesDeal;
  products: AdminProduct[];
  compatibilities: Record<string, string[]>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const input = 'w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-xs outline-none focus:border-terracotta';
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await request({ entity: 'deal-details', id: deal.id, ...Object.fromEntries(new FormData(event.currentTarget)) }, 'PATCH');
      router.refresh();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить заявку');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Заявка" subtitle={deal.clientName} onClose={onClose}>
      <form onSubmit={submit} className="mt-6 grid gap-3">
        <input required name="title" defaultValue={deal.title} placeholder="Название заявки" className={input} />
        <DealProducts products={products} compatibilities={compatibilities} initialNames={deal.productInterest || ''} initialAmount={deal.amountKopecks / 100} />
        <input type="hidden" name="probability" value={deal.probability} />
        <label className="text-[10px] text-black/45">Следующий контакт<input name="nextContactAt" type="datetime-local" defaultValue={deal.nextContactAt?.slice(0, 16) || ''} className={`mt-1.5 ${input}`} /></label>
        <textarea name="notes" defaultValue={deal.notes || ''} placeholder="Комментарий: детали общения, договорённости, следующий шаг" className={`${input} min-h-32`} />
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
        <button disabled={saving} className="rounded-full bg-terracotta py-3.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Сохраняем…' : 'Сохранить заявку'}</button>
      </form>
    </Modal>
  );
}

function ClientDetailsForm({ client, onClose }: { client: SalesClient; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const input = 'w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-xs outline-none focus:border-terracotta';
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await request({ entity: 'client-details', id: client.id, ...Object.fromEntries(new FormData(event.currentTarget)) }, 'PATCH');
      router.refresh();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обновить клиента');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Карточка клиента" subtitle="Данные и статус" onClose={onClose}>
      <form onSubmit={submit} className="mt-6 grid gap-3">
        <input required name="fullName" defaultValue={client.fullName} placeholder="Имя клиента" className={input} />
        <div className="grid gap-3 sm:grid-cols-2"><input name="phone" type="tel" defaultValue={client.phone || ''} placeholder="Телефон" className={input} /><input name="email" type="email" defaultValue={client.email || ''} placeholder="Email" className={input} /></div>
        <input name="city" defaultValue={client.city || ''} placeholder="Адрес доставки" className={input} />
        <input type="hidden" name="status" value={client.status} />
        <label className="text-[10px] text-black/45">Следующий контакт<input name="nextContactAt" type="datetime-local" defaultValue={client.nextContactAt?.slice(0, 16) || ''} className={`mt-1.5 ${input}`} /></label>
        <textarea name="notes" defaultValue={client.notes || ''} placeholder="Комментарий о клиенте" className={`${input} min-h-28`} />
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
        <button disabled={saving} className="rounded-full bg-terracotta py-3.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Сохраняем…' : 'Сохранить изменения'}</button>
      </form>
    </Modal>
  );
}

export function ManagerCrm({
  mode,
  workspace,
  query,
  onQueryChange,
  products,
  compatibilities,
}: {
  mode: 'Клиенты' | 'Сделки' | 'Задачи';
  workspace: ManagerWorkspace;
  query: string;
  onQueryChange?: (query: string) => void;
  products: AdminProduct[];
  compatibilities: Record<string, string[]>;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<'client' | 'deal' | 'task' | 'activity' | null>(null);
  const [busy, setBusy] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [dealCosts, setDealCosts] = useState<Record<string, string>>({});
  const [selectedDeal, setSelectedDeal] = useState<SalesDeal | null>(null);
  const [selectedClient, setSelectedClient] = useState<SalesClient | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const clients = workspace.clients
    .filter((item) =>
      `${item.fullName} ${item.phone || ''} ${item.email || ''} ${item.city || ''}`
        .toLowerCase()
        .includes(q),
    )
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const deals = workspace.deals.filter((item) =>
    `${item.title} ${item.clientName} ${item.productInterest || ''}`.toLowerCase().includes(q),
  );
  const tasks = workspace.tasks
    .filter((item) =>
      `${item.title} ${item.clientName || ''} ${item.dealTitle || ''}`.toLowerCase().includes(q),
    )
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const update = async (body: Record<string, unknown>) => {
    if (body.entity === 'deal' && body.stage === 'negotiation') {
      const deal = workspace.deals.find((item) => item.id === body.id);
      const client = deal ? workspace.clients.find((item) => item.id === deal.clientId) : null;
      if (!client || !client.fullName.trim() || !client.city?.trim() || !client.email?.trim()) {
        setUpdateError('Для согласования заполните ФИО, адрес доставки и email клиента.');
        if (client) setSelectedClient(client);
        return;
      }
    }
    setBusy(`${body.entity}-${body.id}`);
    setUpdateError('');
    try {
      const result = await request(body, 'PATCH');
      if (body.entity === 'deal' && body.stage === 'awaiting_payment' && typeof result.paymentUrl === 'string') {
        setPaymentUrl(result.paymentUrl);
      }
      router.refresh();
    } catch (caught) {
      setUpdateError(caught instanceof Error ? caught.message : 'Не удалось обновить данные');
    } finally {
      setBusy('');
    }
  };
  const heading =
    mode === 'Клиенты'
      ? ['Клиенты', '']
      : mode === 'Сделки'
      ? ['Воронка продаж', '']
        : ['Задачи', ''];
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
          <h1 className="font-serif text-4xl">{heading[0]}</h1>
          {onQueryChange && <div className="relative min-w-60 flex-1"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/30">⌕</span><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={mode === 'Сделки' ? 'Поиск по сделкам' : mode === 'Клиенты' ? 'Поиск по клиентам' : 'Поиск по задачам'} className="w-full rounded-full border border-black/10 bg-white py-3 pl-10 pr-4 text-xs outline-none focus:border-terracotta"/></div>}
          {heading[1] && <p className="mt-2 text-xs text-black/45">{heading[1]}</p>}
        </div>
        <div className="flex gap-2">
          {mode === 'Клиенты' && (
            <button
              onClick={() => setModal('activity')}
              className="rounded-full border border-black/15 bg-white px-4 py-3 text-xs font-semibold"
            >
              + Заметка
            </button>
          )}
          <button
            onClick={() =>
              setModal(mode === 'Клиенты' ? 'client' : mode === 'Сделки' ? 'deal' : 'task')
            }
            className="rounded-full bg-terracotta px-5 py-3 text-xs font-semibold text-white"
          >
            + {mode === 'Клиенты' ? 'Клиент' : mode === 'Сделки' ? 'Сделка' : 'Задача'}
          </button>
        </div>
      </div>
      {updateError && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {updateError}
        </p>
      )}
      {mode === 'Клиенты' && (
        <div className="mt-7 space-y-3">
          {clients.map((client) => (
            <article
              key={client.id}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a, select, input, button')) return;
                setSelectedClient(client);
              }}
              className="cursor-pointer rounded-2xl border border-black/[.07] bg-white p-5 transition hover:border-terracotta/35"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#efe7dc] font-serif text-terracotta">
                    {client.fullName
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <h2 className="text-sm font-semibold">{client.fullName}</h2>
                      <span className="text-[10px] text-black/45">Сделок: <strong className="text-black">{client.dealsCount}</strong></span>
                      <span className="text-[10px] text-black/45">Потенциал: <strong className="text-black">{money(client.dealsAmountKopecks)}</strong></span>
                      <span className="text-[10px] text-black/45">Контакт: <strong className="text-black">{dateTime(client.nextContactAt)}</strong></span>
                    </div>
                    <p className="mt-1 text-[10px] text-black/40">
                      {client.phone || 'Телефон не указан'} · {client.email || 'email не указан'}
                    </p>
                    <p className="mt-1 text-[10px] text-black/40">
                      {client.city || 'Адрес доставки не указан'} ·{' '}
                      {sourceNames[client.source] || client.source}
                    </p>
                  </div>
                </div>
                {client.phone && (() => {
                  const phoneDigits = client.phone.replace(/\D/g, '').replace(/^8/, '7');
                  return <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" aria-label={`Написать в WhatsApp ${client.phone}`} title="WhatsApp" className="grid h-9 w-9 place-items-center rounded-full bg-[#25D366] text-white transition hover:brightness-95"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.45L3.5 20l1.1-4.15A8.5 8.5 0 1 1 20.5 11.5Z" /><path d="M9.1 7.7c.22-.5.44-.5.66-.5h.56c.18 0 .42.07.5.35l.76 1.8c.07.2.05.37-.08.55l-.4.5c-.13.15-.12.3 0 .44.37.63.98 1.28 1.76 1.64.2.1.35.08.48-.06l.55-.65c.14-.16.3-.2.5-.12l1.66.78c.27.12.34.28.3.55-.14.75-.73 1.4-1.37 1.52-.45.08-1.03.13-2.93-.65-2.15-.88-3.53-3.04-3.64-3.19-.1-.15-.87-1.16-.87-2.22 0-1.06.55-1.58.76-1.8Z" /></svg></a>
                    <a href={`https://t.me/+${phoneDigits}`} target="_blank" rel="noreferrer" aria-label={`Открыть Telegram для ${client.phone}`} title="Telegram" className="grid h-9 w-9 place-items-center rounded-full bg-[#229ED9] text-white transition hover:brightness-95"><svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path d="M20.7 3.4 2.9 10.3c-1.2.5-1.2 1.2-.2 1.5l4.6 1.4 1.8 5.5c.2.6.1.9.8.9.5 0 .8-.2 1.1-.5l2.2-2.1 4.6 3.4c.8.5 1.4.3 1.6-.8l3-14.2c.3-1.3-.5-1.9-1.7-1.4ZM8 12.7l10.6-6.7c.5-.3.9-.1.5.2l-8.6 7.8-.3 3.3L8 12.7Z" /></svg></a>
                    <a href={`tel:${client.phone}`} aria-label={`Позвонить ${client.phone}`} title={`Позвонить ${client.phone}`} className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.64a2 2 0 0 1-.45 2.11L8 9.76a16 16 0 0 0 6 6l1.29-1.29a2 2 0 0 1 2.11-.45c.86.29 1.74.5 2.64.62A2 2 0 0 1 22 16.92z" /></svg></a>
                  </div>;
                })()}
              </div>
              {client.notes && !client.notes.startsWith('Заявка из помощника сайта.') && (
                <p className="mt-3 line-clamp-2 text-[10px] leading-4 text-black/50">
                  {client.notes}
                </p>
              )}
              {client.email && (
                <div className="mt-4 flex gap-2">
                  <a
                    href={`mailto:${client.email}`}
                    className="rounded-full border border-black/10 px-4 py-2 text-[10px] font-semibold"
                  >
                    Написать
                  </a>
                </div>
              )}
            </article>
          ))}
          {clients.length === 0 && (
            <div className="lg:col-span-2">
              <Empty>
                {workspace.clients.length
                  ? 'По запросу ничего не найдено'
                  : 'Клиентов пока нет. Добавьте первый контакт, чтобы начать вести историю.'}
              </Empty>
            </div>
          )}
        </div>
      )}
      {mode === 'Сделки' && (
        <>
          {workspace.deals.some(
            (deal) => deal.stage === 'won' && deal.purchaseCostKopecks === null,
          ) && (
            <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
              В завершённых сделках есть неизвестная сумма закупки. Заполните её, чтобы прибыль
              компании считалась правильно.
            </p>
          )}
          <div className="mt-7 overflow-x-auto pb-2">
            <div className="grid min-w-[1000px] grid-cols-6 gap-3">
              {pipelineStages.map(([stage, label]) => {
                const items = deals.filter((deal) => deal.stage === stage || (stage === 'new' && deal.stage === 'qualification'));
                return (
                  <section
                    key={stage}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDropStage(stage);
                    }}
                    onDragLeave={() => setDropStage((current) => (current === stage ? null : current))}
                    onDrop={(event) => {
                      event.preventDefault();
                      const dealId = event.dataTransfer.getData('text/plain');
                      const draggedDeal = deals.find((deal) => deal.id === dealId);
                      setDraggingDealId(null);
                      setDropStage(null);
                      if (draggedDeal && draggedDeal.stage !== stage) update({ entity: 'deal', id: dealId, stage });
                    }}
                    className={`rounded-2xl p-3 transition ${dropStage === stage ? 'bg-terracotta/15 ring-1 ring-terracotta/35' : 'bg-black/[.035]'}`}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-[10px] font-semibold uppercase tracking-[.1em]">
                        {label}
                      </h2>
                      <span className="rounded-full bg-white px-2 py-1 text-[9px]">
                        {items.length}
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] text-black/35">
                      {money(items.reduce((sum, item) => sum + item.amountKopecks, 0))}
                    </p>
                    <div className="mt-3 space-y-2">
                      {items.map((deal) => (
                        <article
                          key={deal.id}
                          draggable={deal.stage !== 'won'}
                          onDragStart={(event) => {
                            if (deal.stage === 'won') return;
                            event.dataTransfer.setData('text/plain', deal.id);
                            event.dataTransfer.effectAllowed = 'move';
                            setDraggingDealId(deal.id);
                          }}
                          onDragEnd={() => {
                            setDraggingDealId(null);
                            setDropStage(null);
                          }}
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest('input, select, button')) return;
                            setSelectedDeal(deal);
                          }}
                          className={`${deal.stage === 'won' ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} rounded-xl bg-white p-3 shadow-sm ${draggingDealId === deal.id ? 'opacity-40' : ''} ${deal.stage === 'won' && deal.purchaseCostKopecks === null ? 'ring-1 ring-red-300' : ''}`}
                        >
                          <p className="text-[11px] font-semibold leading-4">{deal.title}</p>
                          <p className="mt-1 text-[9px] text-black/40">{deal.clientName}</p>
                          <p className="mt-3 text-xs font-semibold">{money(deal.amountKopecks)}</p>
                          {deal.purchaseCostKopecks !== null ? (
                            <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-[9px]">
                              <p>Закупка: {money(deal.purchaseCostKopecks)}</p>
                              <p className="mt-1 font-semibold text-emerald-700">
                                Валовая прибыль:{' '}
                                {money(deal.amountKopecks - deal.purchaseCostKopecks)}
                              </p>
                            </div>
                          ) : deal.stage === 'won' ? (
                            <div className="mt-2 rounded-lg bg-red-50 p-2">
                              <p className="text-[9px] font-semibold text-red-700">
                                Укажите сумму закупки
                              </p>
                              <div className="mt-2 flex gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  max={deal.amountKopecks / 100}
                                  placeholder="₽"
                                  value={dealCosts[deal.id] || ''}
                                  onChange={(event) =>
                                    setDealCosts((current) => ({
                                      ...current,
                                      [deal.id]: event.target.value,
                                    }))
                                  }
                                  className="min-w-0 flex-1 rounded-md border border-red-200 bg-white px-2 py-1.5 text-[9px]"
                                />
                                <button
                                  disabled={busy === `deal-cost-${deal.id}` || !dealCosts[deal.id]}
                                  onClick={() =>
                                    update({
                                      entity: 'deal-cost',
                                      id: deal.id,
                                      purchaseCost: dealCosts[deal.id],
                                    })
                                  }
                                  className="rounded-md bg-red-600 px-2 text-[9px] font-semibold text-white disabled:opacity-40"
                                >
                                  Сохранить
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-2 h-1 rounded-full bg-black/[.06]">
                            <div
                              className="h-full rounded-full bg-terracotta"
                              style={{ width: `${deal.probability}%` }}
                            />
                          </div>
                          {deal.nextContactAt && (
                            <p className="mt-2 text-[9px] text-black/40">
                              Контакт: {dateTime(deal.nextContactAt)}
                            </p>
                          )}
                          <select
                            disabled={busy === `deal-${deal.id}` || deal.stage === 'won'}
                            value={deal.stage}
                            onChange={(event) =>
                              update({ entity: 'deal', id: deal.id, stage: event.target.value })
                            }
                            className="mt-3 w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[9px]"
                          >
                            {pipelineStages.map(([value, name]) => (
                              <option
                                key={value}
                                value={value}
                                disabled={value === 'won' && deal.purchaseCostKopecks === null}
                              >
                                {name}
                              </option>
                            ))}
                          </select>
                        </article>
                      ))}
                      {items.length === 0 && (
                        <p className="rounded-xl border border-dashed border-black/10 py-7 text-center text-[9px] text-black/25">
                          Пусто
                        </p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
            {workspace.deals.length === 0 && (
              <div className="mt-4">
                <Empty>Создайте первую сделку и двигайте её по этапам воронки.</Empty>
              </div>
            )}
          </div>
        </>
      )}
      {mode === 'Задачи' && (
        <div className="mt-7 space-y-3">
          {tasks.map((task) => {
            const overdue = task.status === 'open' && new Date(task.dueAt).getTime() < Date.now();
            return (
              <article
                key={task.id}
                onClick={(event) => {
                  if (!task.dealId || (event.target as HTMLElement).closest('button, select, input, a')) return;
                  const deal = workspace.deals.find((item) => item.id === task.dealId);
                  if (deal) setSelectedDeal(deal);
                }}
                className={`grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center ${task.dealId ? 'cursor-pointer transition hover:border-terracotta/35' : ''} ${overdue ? 'border-red-200' : 'border-black/[.07]'} ${task.status !== 'open' ? 'opacity-60' : ''}`}
              >
                <button
                  disabled={busy === `task-${task.id}`}
                  onClick={() =>
                    update({
                      entity: 'task',
                      id: task.id,
                      status: task.status === 'done' ? 'open' : 'done',
                    })
                  }
                  aria-label={
                    task.status === 'done'
                      ? 'Вернуть задачу в работу'
                      : 'Отметить задачу выполненной'
                  }
                  className={`grid h-7 w-7 place-items-center rounded-full border text-xs ${task.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : task.status === 'cancelled' ? 'border-black/10 bg-black/[.04] text-black/25' : 'border-black/20'}`}
                >
                  {task.status === 'done' ? '✓' : task.status === 'cancelled' ? '×' : ''}
                </button>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      className={`text-sm font-semibold ${task.status === 'done' ? 'line-through' : ''}`}
                    >
                      {task.title}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-1 text-[9px] ${task.priority === 'high' ? 'bg-red-50 text-red-700' : task.priority === 'low' ? 'bg-black/[.04] text-black/45' : 'bg-amber-50 text-amber-700'}`}
                    >
                      {priorityNames[task.priority]}
                    </span>
                  </div>
                  <p
                    className={`mt-1 text-[10px] ${overdue ? 'font-semibold text-red-600' : 'text-black/40'}`}
                  >
                    {overdue ? 'Просрочено · ' : ''}
                    {dateTime(task.dueAt)}
                    {task.clientName ? ` · ${task.clientName}` : ''}
                    {task.dealTitle ? ` · ${task.dealTitle}` : ''}
                  </p>
                  {task.description && (
                    <p className="mt-2 text-[10px] text-black/50">{task.description}</p>
                  )}
                </div>
                <select
                  disabled={busy === `task-${task.id}`}
                  value={task.status}
                  onChange={(event) =>
                    update({ entity: 'task', id: task.id, status: event.target.value })
                  }
                  aria-label={`Статус задачи «${task.title}»`}
                  className="rounded-full border border-black/10 bg-white px-3 py-2 text-[10px] font-semibold outline-none transition focus:border-terracotta"
                >
                  {Object.entries(taskStatusNames).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </article>
            );
          })}
          {tasks.length === 0 && (
            <Empty>
              {workspace.tasks.length
                ? 'По запросу ничего не найдено'
                : 'Задач пока нет. Запланируйте звонок, встречу или контроль оплаты.'}
            </Empty>
          )}
        </div>
      )}
      {modal && <CrmForm kind={modal} workspace={workspace} products={products} compatibilities={compatibilities} onClose={() => setModal(null)} />}
      {selectedDeal && <DealDetailsForm deal={selectedDeal} products={products} compatibilities={compatibilities} onClose={() => setSelectedDeal(null)} />}
      {selectedClient && <ClientDetailsForm client={selectedClient} onClose={() => setSelectedClient(null)} />}
      {paymentUrl && <Modal title="Ссылка на оплату готова" subtitle="Продажа создана" onClose={() => setPaymentUrl(null)}><div className="mt-6"><p className="text-sm leading-6 text-black/60">Скопируйте ссылку или сразу отправьте её клиенту в мессенджер.</p><div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => navigator.clipboard.writeText(paymentUrl)} className="rounded-full border border-black/15 px-5 py-3.5 text-xs font-semibold">Скопировать ссылку</button><button type="button" onClick={async () => { if (navigator.share) await navigator.share({ title: 'Оплата заказа', text: 'Ссылка на оплату заказа', url: paymentUrl }); else await navigator.clipboard.writeText(paymentUrl); }} className="rounded-full border border-black/15 px-5 py-3.5 text-xs font-semibold">Поделиться</button></div><a href={paymentUrl} target="_blank" rel="noreferrer" className="mt-2 block rounded-full bg-terracotta px-5 py-3.5 text-center text-xs font-semibold text-white">Открыть оплату</a></div></Modal>}
    </div>
  );
}

export function ManagerOverview({
  workspace,
  orders,
  managerUserId,
  onOpen,
}: {
  workspace: ManagerWorkspace;
  orders: PaymentOrder[];
  managerUserId: string;
  onOpen: (section: string) => void;
}) {
  const openTasks = workspace.tasks.filter((task) => task.status === 'open');
  const overdue = openTasks.filter((task) => new Date(task.dueAt).getTime() < Date.now());
  const activeDeals = workspace.deals.filter((deal) => !['won', 'lost'].includes(deal.stage));
  const pipeline = activeDeals.reduce((sum, deal) => sum + deal.amountKopecks, 0);
  const personalSales = orders.filter(
    (order) => order.managerUserId === managerUserId && order.status === 'confirmed',
  );
  const attentionPayments = orders.filter(
    (order) =>
      order.managerUserId === managerUserId &&
      ['created', 'payment_initialized', 'payment_init_failed', 'payment_failed'].includes(
        order.status,
      ),
  );
  const cards = [
    {
      label: 'Мои продажи',
      value: String(personalSales.length),
      note: `На сумму ${money(personalSales.reduce((sum, order) => sum + order.amountKopecks, 0))}`,
      section: 'Платежи',
    },
    {
      label: 'Задачи',
      value: String(openTasks.length),
      note: overdue.length ? `${overdue.length} просрочено` : 'Просроченных нет',
      section: 'Задачи',
    },
    {
      label: 'Активные сделки',
      value: String(activeDeals.length),
      note: `Потенциал ${money(pipeline)}`,
      section: 'Воронка продаж',
    },
    {
      label: 'Платежи в работе',
      value: String(attentionPayments.length),
      note: 'Ваши ссылки и заказы сайта',
      section: 'Платежи',
    },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-4xl">Центр продаж</h1>
        <button
          onClick={() => onOpen('Воронка продаж')}
          className="rounded-full bg-terracotta px-5 py-3 text-xs font-semibold text-white"
        >
          + Новая сделка
        </button>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={() => onOpen(card.section)}
            className="rounded-2xl border border-black/[.06] bg-white p-5 text-left"
          >
            <p className="text-[10px] text-black/40">{card.label}</p>
            <p className="mt-3 text-2xl font-semibold">{card.value}</p>
            <p
              className={`mt-2 text-[10px] ${card.note.includes('просрочено') ? 'text-red-600' : 'text-black/40'}`}
            >
              {card.note}
            </p>
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
        <section className="rounded-2xl border border-black/[.06] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-2xl">Ближайшие задачи</h2>
              <p className="mt-1 text-[10px] text-black/40">
                Что требует внимания в первую очередь
              </p>
            </div>
            <button
              onClick={() => onOpen('Задачи')}
              className="text-[10px] font-semibold text-terracotta"
            >
              Все задачи →
            </button>
          </div>
          <div className="mt-5 divide-y divide-black/[.06]">
            {openTasks.slice(0, 6).map((task) => (
              <button
                key={task.id}
                onClick={() => onOpen('Задачи')}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <span
                  className={`h-2 w-2 rounded-full ${task.priority === 'high' ? 'bg-red-500' : 'bg-amber-400'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{task.title}</span>
                  <span className="mt-1 block text-[9px] text-black/40">
                    {task.clientName || 'Без клиента'} · {dateTime(task.dueAt)}
                  </span>
                </span>
              </button>
            ))}
            {openTasks.length === 0 && (
              <p className="py-9 text-center text-xs text-black/35">На сегодня задач нет</p>
            )}
          </div>
        </section>
        <section className="rounded-2xl bg-[#292925] p-5 text-white sm:p-6">
          <h2 className="font-serif text-2xl">Последние действия</h2>
          <p className="mt-1 text-[10px] text-white/35">История работы в CRM</p>
          <div className="mt-5 space-y-4">
            {workspace.activities.slice(0, 6).map((activity) => (
              <div key={activity.id} className="border-l border-white/15 pl-3">
                <p className="text-[10px] leading-4 text-white/80">{activity.description}</p>
                <p className="mt-1 text-[8px] text-white/30">
                  {activity.clientName || activity.dealTitle || 'CRM'} ·{' '}
                  {dateTime(activity.createdAt)}
                </p>
              </div>
            ))}
            {workspace.activities.length === 0 && (
              <p className="py-8 text-center text-[10px] text-white/30">
                История появится после первого действия
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
