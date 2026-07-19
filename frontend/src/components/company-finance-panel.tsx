'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CompanyFinance } from '@/lib/company-finance';

const financeCategoryNames: Record<string, string> = {
  taxes: 'Налоги',
  payroll: 'Зарплаты',
  rent: 'Аренда',
  acquiring: 'Эквайринг',
  advertising: 'Реклама',
  subscriptions: 'Подписки и сервисы',
  logistics: 'Логистика',
  utilities: 'Коммунальные расходы',
  services: 'Услуги подрядчиков',
  other: 'Прочее',
};

const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100);
const monthName = (month: string) => new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

export function CompanyFinancePanel({ data }: { data: CompanyFinance }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [calculationType, setCalculationType] = useState<'fixed' | 'revenue_percent'>('fixed');
  const [recurrence, setRecurrence] = useState<'recurring' | 'one_time'>('recurring');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const summary = data.summary;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch('/api/admin/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, calculationType, recurrence }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить расход');
      setFormOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить расход');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Удалить этот расход?')) return;
    setError('');
    const response = await fetch('/api/admin/finance', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const payload = await response.json();
    if (!response.ok) setError(payload.error || 'Не удалось удалить расход');
    else router.refresh();
  };

  const input = 'w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-xs outline-none transition focus:border-terracotta';
  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-terracotta">Управленческий учёт</p><h1 className="mt-2 font-serif text-4xl tracking-[-.04em]">Финансы компании</h1><p className="mt-3 text-sm text-black/50">Выручка, себестоимость, постоянные расходы и реальная доходность бизнеса.</p></div>
      <div className="flex flex-wrap items-center gap-2"><input type="month" value={data.selectedMonth} onChange={(event) => router.replace(`/admin?section=finance&financeMonth=${event.target.value}`)} className="rounded-full border border-black/10 bg-white px-4 py-3 text-xs font-semibold"/><button disabled={!data.databaseReady} onClick={() => setFormOpen(true)} className="rounded-full bg-terracotta px-5 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">+ Добавить расход</button></div>
    </div>

    {!data.databaseReady && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800"><p className="font-semibold">Раздел подготовлен локально</p><p className="mt-1 text-xs">Хранилище расходов включится после применения обновления базы при публикации.</p></div>}
    {summary.paidOrdersMissingCost > 0 && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">У {summary.paidOrdersMissingCost} оплаченных заказов отсутствует себестоимость. Прибыль за месяц пока ориентировочная.</div>}
    {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}

    <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ['Выручка', money(summary.revenueKopecks), `${summary.paidOrders} оплаченных заказов`, 'bg-[#292925] text-white'],
        ['Себестоимость', money(summary.purchaseCostKopecks), 'Закупочная стоимость товаров', 'border border-black/[.07] bg-white'],
        ['Валовая прибыль', money(summary.grossProfitKopecks), 'Выручка минус себестоимость', 'border border-black/[.07] bg-white'],
        ['Расходы компании', money(summary.operatingExpensesKopecks), monthName(data.selectedMonth), 'bg-[#efe4d8]'],
        ['Чистая прибыль', money(summary.netProfitKopecks), `Рентабельность ${summary.profitabilityPercent}%`, summary.netProfitKopecks >= 0 ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'],
      ].map(([label,value,note,tone]) => <article key={label} className={`rounded-2xl p-5 ${tone}`}><p className="text-[10px] opacity-55">{label}</p><p className="mt-3 text-xl font-semibold tracking-[-.03em]">{value}</p><p className="mt-2 text-[10px] opacity-55">{note}</p></article>)}
    </section>

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <section className="rounded-2xl border border-black/[.07] bg-white p-5 sm:p-6">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-terracotta">Динамика</p><h2 className="mt-2 font-serif text-2xl">Доходность за 6 месяцев</h2></div>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[9px] uppercase tracking-[.1em] text-black/35"><tr><th className="pb-3">Месяц</th><th className="pb-3">Выручка</th><th className="pb-3">Расходы</th><th className="pb-3">Чистая прибыль</th><th className="pb-3 text-right">Рентабельность</th></tr></thead><tbody className="divide-y divide-black/[.06]">{data.trend.map((item) => <tr key={item.month}><td className="py-3 capitalize">{monthName(item.month)}</td><td className="py-3">{money(item.revenueKopecks)}</td><td className="py-3">{money(item.operatingExpensesKopecks + item.purchaseCostKopecks)}</td><td className={`py-3 font-semibold ${item.netProfitKopecks >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{money(item.netProfitKopecks)}</td><td className="py-3 text-right">{item.profitabilityPercent}%</td></tr>)}</tbody></table>{data.trend.length === 0 && <p className="py-10 text-center text-xs text-black/35">Данные появятся после подключения финансового учёта</p>}</div>
      </section>
      <section className="rounded-2xl border border-black/[.07] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-terracotta">Расходы</p><h2 className="mt-2 font-serif text-2xl capitalize">{monthName(data.selectedMonth)}</h2></div><span className="rounded-full bg-black/[.04] px-3 py-1.5 text-xs font-semibold">{data.expenses.length}</span></div>
        <div className="mt-5 divide-y divide-black/[.06]">{data.expenses.map((expense) => <div key={expense.id} className="flex items-start gap-3 py-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-terracotta"/><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{expense.name}</p><p className="mt-1 text-[9px] text-black/40">{financeCategoryNames[expense.category] || 'Прочее'} · {expense.recurrence === 'recurring' ? 'ежемесячно' : 'разовый'}{expense.calculationType === 'revenue_percent' ? ` · ${expense.revenuePercent}% от выручки` : ''}</p></div><div className="text-right"><p className="text-xs font-semibold">{money(expense.calculatedAmountKopecks)}</p><button onClick={() => remove(expense.id)} className="mt-1 text-[9px] text-red-500">Удалить</button></div></div>)}{data.expenses.length === 0 && <p className="py-10 text-center text-xs text-black/35">В этом месяце расходы ещё не указаны</p>}</div>
      </section>
    </div>

    {formOpen && <div className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-black/45 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setFormOpen(false)}><div className="my-5 w-full max-w-xl rounded-3xl bg-[#fbfaf8] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-terracotta">Финансы компании</p><h2 className="mt-2 font-serif text-3xl">Новый расход</h2></div><button onClick={() => setFormOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-black/10 text-xl text-black/45">×</button></div><form onSubmit={save} className="mt-6 grid gap-3"><input required name="name" placeholder="Например: аренда офиса" className={input}/><select required name="category" className={input}>{Object.entries(financeCategoryNames).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><div className="grid grid-cols-2 gap-2 rounded-xl bg-black/[.035] p-1"><button type="button" onClick={() => setRecurrence('recurring')} className={`rounded-lg px-3 py-2.5 text-[10px] font-semibold ${recurrence === 'recurring' ? 'bg-white shadow-sm' : 'text-black/45'}`}>Постоянный ежемесячный</button><button type="button" onClick={() => setRecurrence('one_time')} className={`rounded-lg px-3 py-2.5 text-[10px] font-semibold ${recurrence === 'one_time' ? 'bg-white shadow-sm' : 'text-black/45'}`}>Разовый расход</button></div><div className="grid grid-cols-2 gap-2 rounded-xl bg-black/[.035] p-1"><button type="button" onClick={() => setCalculationType('fixed')} className={`rounded-lg px-3 py-2.5 text-[10px] font-semibold ${calculationType === 'fixed' ? 'bg-white shadow-sm' : 'text-black/45'}`}>Сумма в рублях</button><button type="button" onClick={() => setCalculationType('revenue_percent')} className={`rounded-lg px-3 py-2.5 text-[10px] font-semibold ${calculationType === 'revenue_percent' ? 'bg-white shadow-sm' : 'text-black/45'}`}>Процент от выручки</button></div>{calculationType === 'fixed' ? <input required name="amount" type="number" min="1" step="1" placeholder="Сумма, ₽" className={input}/> : <input required name="revenuePercent" type="number" min="0.001" max="100" step="0.001" placeholder="Процент от выручки" className={input}/>}<div className={`grid gap-3 ${recurrence === 'recurring' ? 'sm:grid-cols-2' : ''}`}><label className="text-[10px] text-black/45">{recurrence === 'recurring' ? 'Действует с месяца' : 'Месяц расхода'}<input required name="startMonth" type="month" defaultValue={data.selectedMonth} className={`mt-1.5 ${input}`}/></label>{recurrence === 'recurring' && <label className="text-[10px] text-black/45">Действует до (необязательно)<input name="endMonth" type="month" className={`mt-1.5 ${input}`}/></label>}</div><textarea name="notes" placeholder="Комментарий" className={`${input} min-h-20`}/>{error && <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}<button disabled={saving} className="mt-2 rounded-full bg-terracotta py-3.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Сохраняем…' : 'Добавить расход'}</button></form></div></div>}
  </div>;
}
