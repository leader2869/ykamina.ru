import type { SalesAnalytics } from '@/lib/payment-orders';

const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100);
const conversion = (paid: number, orders: number) => orders ? Math.round(paid / orders * 100) : 0;

export function SalesAnalyticsPanel({ data, showManagers = false }: { data: SalesAnalytics; showManagers?: boolean }) {
  const channels = [
    { label: 'Заказы с сайта', data: data.website, tone: 'bg-[#292925] text-white' },
    { label: 'Продажи менеджеров', data: data.manager, tone: 'border border-black/[.07] bg-white' },
  ];
  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-terracotta">Все продажи</p><h1 className="mt-2 font-serif text-4xl tracking-[-.04em]">Аналитика продаж</h1><p className="mt-3 text-sm text-black/50">Выручка считается только по заказам с подтверждённой оплатой.</p></div><span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Оплачено {data.paidOrders} из {data.orders}</span></div>
    <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Выручка', money(data.revenueKopecks), 'Подтверждённые оплаты'],
      ['Оплаченные продажи', String(data.paidOrders), `Конверсия ${conversion(data.paidOrders, data.orders)}%`],
      ['Средний чек', money(data.averageCheckKopecks), 'По оплаченным заказам'],
      ['Ожидают оплаты', String(data.awaitingPayment), 'Ссылки и заказы в работе'],
    ].map(([label, value, note], index) => <article key={label} className={`rounded-2xl p-5 ${index === 0 ? 'bg-terracotta text-white' : 'border border-black/[.07] bg-white'}`}><p className={`text-[11px] ${index === 0 ? 'text-white/60' : 'text-black/45'}`}>{label}</p><p className="mt-3 text-2xl font-semibold tracking-[-.03em]">{value}</p><p className={`mt-2 text-[10px] ${index === 0 ? 'text-white/55' : 'text-black/40'}`}>{note}</p></article>)}</section>
    <section className="mt-5 grid gap-4 lg:grid-cols-2">{channels.map((channel) => <article key={channel.label} className={`rounded-2xl p-5 sm:p-6 ${channel.tone}`}><div className="flex items-start justify-between gap-4"><div><p className="text-xs opacity-55">Канал продаж</p><h2 className="mt-2 font-serif text-2xl">{channel.label}</h2></div><span className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold">{channel.data.orders}</span></div><p className="mt-6 font-serif text-3xl">{money(channel.data.revenueKopecks)}</p><div className="mt-4 flex justify-between border-t border-current/10 pt-4 text-xs opacity-60"><span>Оплачено: {channel.data.paidOrders}</span><span>Конверсия: {conversion(channel.data.paidOrders, channel.data.orders)}%</span></div></article>)}</section>
    {showManagers && <section className="mt-5 rounded-2xl border border-black/[.07] bg-white p-5 sm:p-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-terracotta">Команда</p><h2 className="mt-2 font-serif text-2xl">Продажи по менеджерам</h2></div><div className="mt-5 divide-y divide-black/[.07]">{data.managers.map((manager, index) => <div key={manager.id} className="grid grid-cols-[32px_1fr_auto] items-center gap-3 py-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-black/[.04] text-[10px] font-semibold">{index + 1}</span><div><p className="text-sm font-semibold">{manager.name}</p><p className="mt-1 text-[10px] text-black/40">{manager.paidOrders} оплачено из {manager.orders}</p></div><strong className="text-sm">{money(manager.revenueKopecks)}</strong></div>)}{data.managers.length === 0 && <p className="py-8 text-center text-sm text-black/40">Менеджерских продаж пока нет</p>}</div></section>}
  </div>;
}
