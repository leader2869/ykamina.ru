'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { logout } from '@/app/auth-actions';
import type { AdminCategory, AdminProduct } from '@/lib/admin';
import type { PaymentOrder, SalesAnalytics } from '@/lib/payment-orders';
import { ShareProductButton } from '@/components/share-product-button';
import { ManagerSales } from '@/components/manager-sales';
import { SalesAnalyticsPanel } from '@/components/sales-analytics-panel';
import { ManagerProductEditor } from '@/components/manager-product-editor';

type IconName = 'home' | 'catalog' | 'funnel' | 'users' | 'check' | 'chart' | 'search' | 'bell' | 'plus' | 'phone' | 'clock' | 'arrow' | 'calendar' | 'fire' | 'close';

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7"/></>,
    catalog: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/></>,
    funnel: <><path d="M4 5h16M6.5 10h11M9 15h6M11 20h2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    check: <><path d="m4 12 5 5L20 6"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.84.56 2.8.69A2 2 0 0 1 22 16.92Z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    arrow: <><path d="m9 18 6-6-6-6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    fire: <><path d="M12.5 2s.5 4-3 7.5S6 17 12 22c0-3 2-4.5 3.5-6.5C18 12 16 6 12.5 2Z"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

const navItems: { label: string; icon: IconName; count?: number }[] = [
  { label: 'Обзор', icon: 'home' },
  { label: 'Каталог', icon: 'catalog' },
  { label: 'Сделки', icon: 'funnel', count: 12 },
  { label: 'Клиенты', icon: 'users' },
  { label: 'Задачи', icon: 'check', count: 5 },
  { label: 'Аналитика', icon: 'chart' },
];

const pipeline = [
  { label: 'Новые', count: 8, amount: '1,24 млн ₽', width: 72, color: 'bg-[#d4a373]' },
  { label: 'Консультация', count: 6, amount: '890 тыс. ₽', width: 58, color: 'bg-[#b66a4a]' },
  { label: 'Предложение', count: 4, amount: '640 тыс. ₽', width: 44, color: 'bg-terracotta' },
  { label: 'Согласование', count: 3, amount: '485 тыс. ₽', width: 34, color: 'bg-[#743e2d]' },
];

const deals = [
  { initials: 'АВ', name: 'Анна Воронова', product: 'Каминокомплект RealFlame', amount: 186900, stage: 'Предложение', next: 'Сегодня, 14:30', hot: true, tone: 'bg-[#f1dfd3] text-[#8d452f]' },
  { initials: 'МК', name: 'Михаил Круглов', product: 'Электроочаг Cassette 1000', amount: 242500, stage: 'Согласование', next: 'Сегодня, 16:00', hot: true, tone: 'bg-[#dce4dc] text-[#48604c]' },
  { initials: 'ЕС', name: 'Елена Соколова', product: 'Портал Coventry + очаг', amount: 119800, stage: 'Консультация', next: 'Завтра, 11:00', hot: false, tone: 'bg-[#deddeb] text-[#55527a]' },
  { initials: 'ДП', name: 'Дмитрий Панов', product: 'Биокамин Firezo Бостон', amount: 89700, stage: 'Новая', next: 'Сегодня, 18:00', hot: false, tone: 'bg-[#e7ded2] text-[#705d42]' },
];

const tasks = [
  { time: '10:30', title: 'Отправить подборку Анне', detail: '3 каминокомплекта до 200 000 ₽', urgent: true },
  { time: '12:00', title: 'Уточнить наличие на складе', detail: 'Очаг Cassette 1000 · заказ #1842', urgent: false },
  { time: '14:30', title: 'Созвон с Анной Вороновой', detail: 'Обсудить доставку и монтаж', urgent: false },
];

function formatMoney(value: number) { return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`; }

type ManagerCatalog = {
  databaseConnected: boolean;
  metrics: { products: number; published: number };
  products: AdminProduct[];
  categories: AdminCategory[];
};

function availabilityTone(value: string) {
  if (value === 'Много') return 'bg-emerald-50 text-emerald-700';
  if (value === 'Мало') return 'bg-amber-50 text-amber-700';
  return 'bg-black/[.04] text-black/45';
}

function ProductPrices({ product }: { product: AdminProduct }) {
  const retail = product.availability?.recommendedRetailPrice || product.price;
  const wholesale = product.availability?.wholesalePrice;
  const earning = wholesale ? retail - wholesale : null;
  const earningPercent = earning !== null && retail > 0 ? Math.round(earning / retail * 100) : null;
  return <div className="space-y-1 whitespace-nowrap text-[10px]">
    <p className="flex items-center justify-between gap-3"><span className="text-black/40">Розница</span><strong className="text-xs text-black/80">{formatMoney(retail)}</strong></p>
    <p className="flex items-center justify-between gap-3"><span className="text-black/40">Опт</span><span className="font-medium text-black/55">{wholesale ? formatMoney(wholesale) : 'Нет данных'}</span></p>
    {earning !== null && <p className={`flex items-center justify-between gap-3 border-t border-black/[.07] pt-1 ${earning >= 0 ? 'text-emerald-700' : 'text-red-700'}`}><span>Доход</span><strong>{earning >= 0 ? '+' : ''}{formatMoney(earning)}{earningPercent !== null ? ` · ${earningPercent}%` : ''}</strong></p>}
  </div>;
}

function categoryGroups(categories: AdminCategory[]) {
  const categoryOrder: Record<string, number> = { 'электрокамины': 1, 'электроочаги': 2, 'порталы': 3, 'биокамины': 4, 'другое': 5 };
  const roots = categories.filter((item) => !item.parentId).sort((left, right) => (categoryOrder[left.slug] ?? 99) - (categoryOrder[right.slug] ?? 99) || left.name.localeCompare(right.name, 'ru'));
  const children = categories.filter((item) => item.parentId);
  return roots.map((root) => ({ ...root, children: children.filter((item) => item.parentId === root.id), total: root.productCount + children.filter((item) => item.parentId === root.id).reduce((sum, item) => sum + item.productCount, 0) }));
}

function ManagerCatalog({ data, query, selectedCategory, onCategoryChange, onQueryChange }: { data: ManagerCatalog; query: string; selectedCategory: string; onCategoryChange: (slug: string) => void; onQueryChange: (query: string) => void }) {
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const groups = categoryGroups(data.categories);
  const normalizedQuery = query.trim().toLowerCase();
  const category = data.categories.find((item) => item.slug === selectedCategory);
  const childSlugs = category && !category.parentId ? new Set(data.categories.filter((item) => item.parentId === category.id).map((item) => item.slug)) : null;
  const products = data.products.filter((product) => {
    const matchesCategory = !selectedCategory || product.categorySlug === selectedCategory || Boolean(childSlugs?.has(product.categorySlug || ''));
    const matchesQuery = !normalizedQuery || `${product.name} ${product.sku} ${product.category} ${product.parentCategory || ''}`.toLowerCase().includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });

  return <>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-terracotta">Рабочий каталог</p><h1 className="mt-2 font-serif text-[34px] leading-none tracking-[-.035em] sm:text-[42px]">Каталог товаров</h1><p className="mt-3 text-[13px] text-black/50">Цены, маржинальность, остатки и служебный статус товаров.</p></div><div className="flex items-center gap-2 rounded-full border border-black/[.08] bg-white px-4 py-2.5 text-xs text-black/55"><span className={`h-2 w-2 rounded-full ${data.databaseConnected ? 'bg-[#6d9f6b]' : 'bg-amber-500'}`}/>{data.databaseConnected ? 'Данные актуальны' : 'Демонстрационные данные'}</div></div>
    <section className="rounded-2xl border border-black/[.06] bg-[#fbfaf8] p-4 sm:p-6">
      <div className="grid gap-6 xl:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl bg-[#f0ece6] p-3 xl:sticky xl:top-24">
          <button onClick={() => onCategoryChange('')} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold ${!selectedCategory ? 'bg-[#242421] text-white' : 'hover:bg-white'}`}><span>Все товары</span><span className="opacity-55">{data.metrics.products}</span></button>
          <div className="mt-2 space-y-2">{groups.map((group) => <div key={group.id}><button onClick={() => onCategoryChange(group.slug)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold ${selectedCategory === group.slug ? 'bg-white text-terracotta shadow-sm' : 'text-black/70 hover:bg-white'}`}><span>{group.name}</span><span className="text-[10px] opacity-45">{group.total}</span></button>{group.children.length > 0 && <div className="ml-3 mt-1 border-l border-black/10 pl-2">{group.children.map((item) => <button key={item.id} onClick={() => onCategoryChange(item.slug)} className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] ${selectedCategory === item.slug ? 'bg-white font-semibold text-terracotta' : 'text-black/45 hover:text-black/75'}`}><span className="truncate pr-2">{item.name}</span><span className="opacity-50">{item.productCount}</span></button>)}</div>}</div>)}</div>
        </aside>
        <div className="min-w-0">
          <div className="sticky top-[72px] z-30 -mx-2 flex flex-wrap items-center gap-2 border-b border-black/[.07] bg-[#fbfaf8]/95 px-2 py-3 backdrop-blur-md"><div className="relative min-w-60 flex-1"><Icon name="search" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/30"/><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Поиск по всему каталогу" className="w-full rounded-full border border-black/15 bg-white py-2.5 pl-10 pr-4 text-xs outline-none focus:border-terracotta"/></div>{query && <button onClick={() => onQueryChange('')} className="rounded-full border border-black/15 px-4 py-2.5 text-xs font-semibold">Сбросить</button>}<span className="rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-700">{products.length} товаров</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-black/[.07] text-[9px] uppercase tracking-[.14em] text-black/35"><tr><th className="pb-3 font-semibold">Товар</th><th className="pb-3 font-semibold">Цены</th><th className="pb-3 font-semibold">Наличие</th><th className="pb-3 font-semibold">Статус</th><th className="pb-3 text-right font-semibold">Действие</th><th className="pb-3 pl-5 font-semibold">Комментарий</th></tr></thead><tbody className="divide-y divide-black/[.06]">{products.map((product) => {
            const availability = [{ city: 'МСК', value: product.availability?.moscow || 'По запросу' }, { city: 'СПб', value: product.availability?.saintPetersburg || 'По запросу' }];
            return <tr key={product.id}><td className="py-4 pr-4"><div className="flex min-w-0 items-center gap-3">{product.image ? <span className="h-10 w-10 shrink-0 rounded-lg border border-black/10 bg-white bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(product.image).slice(1, -1)})` }} role="img" aria-label={`Главная фотография: ${product.name}`}/> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-dashed border-black/15 text-black/25"><Icon name="fire" className="h-4 w-4"/></span>}<div className="min-w-0"><Link href={`/catalog/${product.id}`} className="font-medium underline-offset-4 transition hover:text-terracotta hover:underline">{product.name}</Link><p className="mt-1 text-[10px] text-black/40">{product.sku} · {[product.parentCategory, product.category].filter(Boolean).join(' / ')}</p></div></div></td><td className="py-4 pr-5"><ProductPrices product={product}/></td><td className="py-4 pr-4"><div className="space-y-1">{availability.map((entry) => <p key={entry.city} className="flex items-center gap-1.5 whitespace-nowrap text-[10px]"><span className="w-6 text-black/30">{entry.city}</span><span className={`rounded-full px-2 py-0.5 font-semibold ${availabilityTone(entry.value)}`}>{entry.value}</span></p>)}</div></td><td className="py-4 pr-4"><span className={`inline-flex items-center gap-2 whitespace-nowrap text-xs ${product.isPublished ? 'text-emerald-700' : 'text-amber-700'}`}><span className={`h-2 w-2 rounded-full ${product.isPublished ? 'bg-emerald-500' : 'bg-amber-500'}`}/>{product.isPublished ? 'Опубликован' : 'Скрыт'}</span></td><td className="py-4 text-right"><div className="flex items-center justify-end gap-2"><button type="button" onClick={() => setEditingProductId(product.id)} aria-label="Редактировать товар" title="Редактировать" className="grid h-8 w-8 place-items-center rounded-full border border-black/15 text-base transition hover:border-terracotta hover:text-terracotta"><span aria-hidden="true">✎</span></button><Link href={`/catalog/${product.id}`} aria-label="Открыть товар" title="Открыть товар" className="grid h-8 w-8 place-items-center rounded-full border border-black/15 text-black/45 transition hover:border-terracotta hover:text-terracotta"><Icon name="arrow" className="h-4 w-4"/></Link><ShareProductButton productId={product.id} productName={product.name}/></div></td><td className="max-w-44 py-4 pl-5 text-xs leading-5"><span className={product.visibilityComment ? 'font-medium text-amber-700' : 'text-black/25'}>{product.visibilityComment || '—'}</span></td></tr>;
          })}</tbody></table>{products.length === 0 && <p className="py-12 text-center text-xs text-black/40">В этой категории ничего не найдено</p>}{data.products.length === 250 && <p className="pt-4 text-center text-[10px] text-black/35">Показаны первые 250 товаров. Используйте категории или поиск.</p>}</div>
        </div>
      </div>
    </section>
    {editingProductId && <ManagerProductEditor productId={editingProductId} categories={data.categories} onClose={() => setEditingProductId(null)}/>}
  </>;
}

export function ManagerDashboard({ user, catalog, orders, analytics }: { user: { fullName: string }; catalog: ManagerCatalog; orders: PaymentOrder[]; analytics: SalesAnalytics }) {
  const [active, setActive] = useState('Обзор');
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskAdded, setTaskAdded] = useState(false);
  const filteredDeals = useMemo(() => deals.filter((deal) => `${deal.name} ${deal.product}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const firstName = user.fullName.trim().split(/\s+/)[0] || 'менеджер';
  const initials = user.fullName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'М';

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaskOpen(false);
    setTaskAdded(true);
    window.setTimeout(() => setTaskAdded(false), 2800);
  }

  return <div className="min-h-screen bg-[#f4f1ec] text-[#22201e]">
    <div className="mx-auto flex min-h-[calc(100vh-72px)] max-w-[1600px] gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <aside className="relative z-50 hidden h-fit w-[76px] shrink-0 overflow-visible rounded-[22px] bg-[#242421] p-3 text-white lg:block lg:sticky lg:top-24">
        <div className="grid place-items-center border-b border-white/10 pb-4 pt-1" title="Отдел продаж Ykamina.ru"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 font-serif text-xl text-gold-light">Y</span></div>
        <nav className="mt-3 grid gap-1">
          {navItems.map((item) => { const count = item.label === 'Сделки' ? orders.length : item.count; return <button key={item.label} type="button" onClick={() => { setActive(item.label); setQuery(''); }} aria-label={item.label} className={`group relative flex h-11 items-center justify-center rounded-xl transition ${active === item.label ? 'bg-white text-[#242421]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}>
            <Icon name={item.icon}/>{Boolean(count) && <span className={`absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[8px] font-bold ${active === item.label ? 'bg-terracotta text-white' : 'bg-white/15 text-white'}`}>{count}</span>}<span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[60] hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#242421] px-3 py-2 text-[11px] font-semibold text-white shadow-xl group-hover:block group-focus-visible:block">{item.label}</span>
          </button>; })}
        </nav>
        <div className="group relative mt-4 grid place-items-center border-t border-white/10 pt-4"><Link href="/account" aria-label="Открыть профиль" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xs font-bold text-gold-light transition hover:bg-white/20">{initials}</Link><div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[60] hidden min-w-48 -translate-y-1/2 rounded-xl bg-[#242421] px-3 py-2.5 text-white shadow-xl group-hover:block"><p className="text-xs font-semibold">{user.fullName}</p><p className="mt-1 text-[10px] text-white/50">Менеджер по продажам</p><p className="mt-2 flex items-center gap-2 text-[10px] text-gold-light"><span className="h-2 w-2 rounded-full bg-[#77a574]"/>На связи до 19:00</p></div></div>
        <form action={logout} className="group relative mt-2 grid place-items-center"><button aria-label="Выйти из аккаунта" className="grid h-10 w-10 place-items-center rounded-xl text-white/55 transition hover:bg-red-500/15 hover:text-red-200"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 5H5v14h5"/><path d="M14 8l4 4-4 4M18 12H9"/></svg></button><span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[60] hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#242421] px-3 py-2 text-[11px] font-semibold text-white shadow-xl group-hover:block">Выйти из аккаунта</span></form>
      </aside>

      <section className="min-w-0 flex-1 overflow-hidden rounded-[22px] bg-[#f4f1ec]">
        <header className="flex h-[76px] items-center justify-between border-b border-black/[.07] bg-[#fbfaf8] px-5 sm:px-8">
          <div className="relative w-full max-w-[390px]">
            <Icon name="search" className="absolute left-0 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-black/35"/>
            {active === 'Каталог' ? <p className="py-3 pl-7 text-[13px] font-semibold text-black/55">Менеджер продаж · Каталог</p> : <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти клиента или сделку" className="w-full border-0 bg-transparent py-3 pl-7 pr-4 text-[13px] outline-none placeholder:text-black/35"/>}
          </div>
          <div className="ml-5 flex items-center gap-2">
            <button className="relative grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white text-black/55 transition hover:border-terracotta hover:text-terracotta" aria-label="Уведомления"><Icon name="bell" className="h-[18px] w-[18px]"/><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-terracotta"/></button>
            <button onClick={() => setTaskOpen(true)} className="ml-1 inline-flex items-center gap-2 rounded-full bg-terracotta px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-terracotta-dark"><Icon name="plus" className="h-4 w-4"/><span className="hidden sm:inline">Новая задача</span></button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-black/[.07] bg-[#fbfaf8] px-4 py-2 lg:hidden">{navItems.map((item) => <button key={item.label} onClick={() => { setActive(item.label); setQuery(''); }} className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[11px] ${active === item.label ? 'bg-[#242421] text-white' : 'text-black/50'}`}><Icon name={item.icon} className="h-4 w-4"/>{item.label}</button>)}</nav>
        <main className="p-5 sm:p-8 xl:p-10">
          {active === 'Каталог' ? <ManagerCatalog data={catalog} query={query} selectedCategory={selectedCategory} onCategoryChange={setSelectedCategory} onQueryChange={setQuery}/> : active === 'Сделки' ? <ManagerSales products={catalog.products} orders={orders}/> : active === 'Аналитика' ? <SalesAnalyticsPanel data={analytics}/> : <>
          {active !== 'Обзор' && <div className="mb-6 flex items-center justify-between rounded-2xl border border-terracotta/15 bg-white px-5 py-4"><div><p className="text-sm font-semibold">Раздел «{active}»</p><p className="mt-1 text-xs text-black/45">Показываем связанные данные в обзорном режиме.</p></div><button onClick={() => setActive('Обзор')} className="text-xs font-semibold text-terracotta">Вернуться к обзору</button></div>}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs text-black/45">Воскресенье, 19 июля</p><h1 className="mt-2 font-serif text-[34px] leading-none tracking-[-.035em] sm:text-[42px]">Доброе утро, {firstName}</h1><p className="mt-3 text-[13px] text-black/50">Сегодня 3 встречи и 5 задач. Две сделки требуют внимания.</p></div>
            <div className="flex items-center gap-2 rounded-full border border-black/[.08] bg-white px-4 py-2.5 text-xs text-black/55"><span className="h-2 w-2 rounded-full bg-[#6d9f6b]"/>План обновлён сейчас</div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Оплаченная выручка', value: formatMoney(analytics.revenueKopecks / 100), note: `${analytics.paidOrders} подтверждённых оплат`, good: true },
              { label: 'Конверсия в оплату', value: `${analytics.orders ? Math.round(analytics.paidOrders / analytics.orders * 100) : 0}%`, note: `${analytics.paidOrders} из ${analytics.orders} заказов`, progress: analytics.orders ? Math.round(analytics.paidOrders / analytics.orders * 100) : 0 },
              { label: 'Ожидают оплаты', value: String(analytics.awaitingPayment), note: 'Активные платёжные ссылки' },
              { label: 'Средний чек', value: formatMoney(analytics.averageCheckKopecks / 100), note: 'По оплаченным заказам', good: true },
            ].map((card) => <article key={card.label} className="rounded-2xl border border-black/[.06] bg-[#fbfaf8] p-5 shadow-[0_14px_34px_-28px_rgba(35,30,24,.45)]">
              <p className="text-[11px] font-medium text-black/45">{card.label}</p><p className="mt-3 text-[25px] font-semibold tracking-[-.035em]">{card.value}</p>
              {'progress' in card && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[.06]"><div className="h-full rounded-full bg-terracotta" style={{ width: `${card.progress}%` }}/></div>}
              <p className={`mt-3 text-[10px] ${card.good ? 'text-[#558052]' : 'text-black/40'}`}>{card.note}</p>
            </article>)}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,.75fr)]">
            <div className="min-w-0 space-y-5">
              <section className="rounded-2xl border border-black/[.06] bg-[#fbfaf8] p-5 sm:p-6">
                <div className="flex items-center justify-between"><div><h2 className="font-serif text-[25px] tracking-[-.025em]">Воронка продаж</h2><p className="mt-1 text-[11px] text-black/40">Потенциал активных сделок · 3,25 млн ₽</p></div><button onClick={() => setActive('Сделки')} className="text-[11px] font-semibold text-terracotta">Все сделки →</button></div>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  {pipeline.map((stage) => <button key={stage.label} onClick={() => setActive('Сделки')} className="group text-left">
                    <div className="flex items-end justify-between"><div><span className="text-xs font-semibold">{stage.label}</span><span className="ml-2 text-[10px] text-black/35">{stage.count}</span></div><span className="text-[11px] font-semibold">{stage.amount}</span></div>
                    <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-black/[.05]"><div className={`h-full rounded-full transition-all group-hover:opacity-75 ${stage.color}`} style={{ width: `${stage.width}%` }}/></div>
                  </button>)}
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-black/[.06] bg-[#fbfaf8]">
                <div className="flex items-center justify-between px-5 py-5 sm:px-6"><div><h2 className="font-serif text-[25px] tracking-[-.025em]">Сделки в работе</h2><p className="mt-1 text-[11px] text-black/40">Ближайшие контакты с клиентами</p></div><button className="grid h-9 w-9 place-items-center rounded-full border border-black/10 text-black/45 hover:text-terracotta" aria-label="Добавить сделку"><Icon name="plus" className="h-4 w-4"/></button></div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left">
                    <thead className="border-y border-black/[.06] bg-[#f4f1ec]/70 text-[9px] uppercase tracking-[.12em] text-black/35"><tr><th className="px-6 py-3 font-semibold">Клиент</th><th className="px-4 py-3 font-semibold">Сумма</th><th className="px-4 py-3 font-semibold">Этап</th><th className="px-4 py-3 font-semibold">Следующий контакт</th><th className="w-10"/></tr></thead>
                    <tbody className="divide-y divide-black/[.05]">
                      {filteredDeals.map((deal) => <tr key={deal.name} className="group transition hover:bg-white"><td className="px-6 py-4"><div className="flex items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${deal.tone}`}>{deal.initials}</span><div><p className="text-[12px] font-semibold">{deal.name}{deal.hot && <span className="ml-1.5 text-terracotta">●</span>}</p><p className="mt-1 text-[10px] text-black/40">{deal.product}</p></div></div></td><td className="px-4 py-4 text-[12px] font-semibold">{formatMoney(deal.amount)}</td><td className="px-4 py-4"><span className="rounded-full bg-[#eee8df] px-2.5 py-1 text-[9px] font-medium text-black/60">{deal.stage}</span></td><td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 text-[10px] ${deal.next.startsWith('Сегодня') ? 'text-terracotta' : 'text-black/45'}`}><Icon name="clock" className="h-3.5 w-3.5"/>{deal.next}</span></td><td className="pr-4"><button className="text-black/25 transition group-hover:text-terracotta" aria-label={`Открыть сделку ${deal.name}`}><Icon name="arrow" className="h-4 w-4"/></button></td></tr>)}
                    </tbody>
                  </table>
                  {filteredDeals.length === 0 && <div className="px-6 py-12 text-center text-xs text-black/40">Ничего не найдено. Попробуйте изменить запрос.</div>}
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-2xl bg-[#292925] p-5 text-white sm:p-6">
                <div className="flex items-start justify-between"><div><p className="text-[10px] uppercase tracking-[.16em] text-white/40">Фокус дня</p><h2 className="mt-2 font-serif text-[24px]">Задачи</h2></div><span className="rounded-full bg-terracotta px-2.5 py-1 text-[10px] font-semibold">3 из 5</span></div>
                <div className="mt-5 space-y-1">
                  {tasks.map((task, index) => <button key={task.title} className="group flex w-full gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-white/[.05]"><span className="mt-0.5 w-9 shrink-0 text-[10px] text-white/40">{task.time}</span><span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-white/25 group-hover:border-terracotta">{index === 0 && <span className="h-1.5 w-1.5 rounded-full bg-terracotta"/>}</span><span><span className="block text-[11px] font-medium text-white/90">{task.title}</span><span className="mt-1 block text-[9px] leading-4 text-white/35">{task.detail}</span></span></button>)}
                </div>
                <button onClick={() => setTaskOpen(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-2.5 text-[10px] font-semibold text-white/65 transition hover:border-white/25 hover:text-white"><Icon name="plus" className="h-3.5 w-3.5"/>Добавить задачу</button>
              </section>

              <section className="rounded-2xl border border-black/[.06] bg-[#fbfaf8] p-5 sm:p-6">
                <div className="flex items-center justify-between"><h2 className="font-serif text-[22px]">Ближайшая встреча</h2><Icon name="calendar" className="h-[18px] w-[18px] text-terracotta"/></div>
                <div className="mt-5 rounded-xl bg-[#f0e8df] p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-white font-serif text-lg text-terracotta">14</span><div><p className="text-[10px] text-black/40">Сегодня · 14:30–15:00</p><p className="mt-1 text-[12px] font-semibold">Анна Воронова</p></div></div><p className="mt-3 text-[10px] leading-4 text-black/50">Консультация по каминокомплекту и монтажу в загородном доме.</p></div>
                <div className="mt-3 grid grid-cols-2 gap-2"><a href="tel:+74951234567" className="flex items-center justify-center gap-1.5 rounded-lg bg-terracotta py-2.5 text-[10px] font-semibold text-white"><Icon name="phone" className="h-3.5 w-3.5"/>Позвонить</a><button className="rounded-lg border border-black/10 py-2.5 text-[10px] font-semibold hover:border-terracotta hover:text-terracotta">Открыть сделку</button></div>
              </section>
            </aside>
          </div></>}
        </main>
      </section>
    </div>

    {taskAdded && <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-[#292925] px-5 py-3 text-xs font-medium text-white shadow-xl">Задача добавлена в план ✓</div>}
    {taskOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setTaskOpen(false); }}>
      <form onSubmit={addTask} className="w-full max-w-md rounded-3xl bg-[#fbfaf8] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between"><div><p className="eyebrow">План на день</p><h2 className="mt-2 font-serif text-3xl">Новая задача</h2></div><button type="button" onClick={() => setTaskOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-black/10 text-black/45"><Icon name="close" className="h-4 w-4"/></button></div>
        <label className="mt-6 block text-[11px] font-semibold">Что нужно сделать<input required autoFocus placeholder="Например, отправить предложение" className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-xs outline-none focus:border-terracotta"/></label>
        <div className="mt-4 grid grid-cols-2 gap-3"><label className="block text-[11px] font-semibold">Дата<input type="date" required defaultValue="2026-07-19" className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-xs outline-none focus:border-terracotta"/></label><label className="block text-[11px] font-semibold">Время<input type="time" required defaultValue="16:00" className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-xs outline-none focus:border-terracotta"/></label></div>
        <label className="mt-4 block text-[11px] font-semibold">Клиент<input placeholder="Имя или телефон" className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-xs outline-none focus:border-terracotta"/></label>
        <button className="mt-6 w-full rounded-full bg-terracotta py-3 text-xs font-semibold text-white transition hover:bg-terracotta-dark">Добавить в план</button>
      </form>
    </div>}
  </div>;
}
