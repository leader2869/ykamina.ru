import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AdminCategory, AdminDashboard, AdminProductDetails, getAdminDashboard, getAdminProduct } from '@/lib/admin';
import { ShareProductButton } from '@/components/share-product-button';
import { PublicationToggle } from '@/components/publication-toggle';
import { DeleteUserButton } from '@/components/delete-user-button';
import { logout } from '@/app/auth-actions';
import { createManualProduct, createUser, deleteUser, toggleProductPublication, updateProduct, updateUser } from './actions';

type Section = 'overview' | 'catalog' | 'team' | 'integrations' | 'security';

const navigation: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'team', label: 'Команда и доступы' },
  { id: 'integrations', label: 'Интеграции' },
  { id: 'security', label: 'Безопасность' },
];

function AdminNavIcon({ section }: { section: Section }) {
  const common = { className: 'h-5 w-5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (section === 'overview') return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9v12h13V9" /><path d="M9.5 21v-6h5v6" /></svg>;
  if (section === 'catalog') return <svg {...common}><rect x="3.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.8" /></svg>;
  if (section === 'team') return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 21c.5-4.3 3-6.5 7-6.5s6.5 2.2 7 6.5" /></svg>;
  if (section === 'integrations') return <svg {...common}><path d="M9.5 14.5 14.5 9.5" /><path d="m7.5 16.5-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0" /><path d="m16.5 7.5 1-1a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" /></svg>;
  return <svg {...common}><path d="M12 3 5 6v5c0 4.8 2.8 8.2 7 10 4.2-1.8 7-5.2 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
}

const roleNames = {
  customer: 'Клиент',
  sales_manager: 'Менеджер продаж',
  super_admin: 'Суперадминистратор',
};

const actionNames: Record<string, string> = {
  'product.published': 'Опубликовал товар',
  'product.unpublished': 'Снял товар с публикации',
  'product.created': 'Создал товар вручную',
  'product.updated': 'Изменил товар',
  'user.created': 'Создал пользователя',
  'user.updated': 'Изменил пользователя',
  'user.deleted': 'Удалил пользователя',
  'user.access_updated': 'Изменил права доступа',
};

const formatMoney = (value: number) => new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', maximumFractionDigits: 0,
}).format(value);

const formatDate = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));

function StatusDot({ tone = 'green' }: { tone?: 'green' | 'amber' | 'red' | 'gray' }) {
  const tones = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', gray: 'bg-ink/25' };
  return <span className={`inline-block h-2 w-2 rounded-full ${tones[tone]}`} />;
}

const availabilityTone = (value: string) => value === 'Много'
  ? 'bg-emerald-50 text-emerald-700'
  : value === 'Мало'
    ? 'bg-amber-50 text-amber-700'
    : 'bg-ink/5 text-ink/55';

function Availability({ product, detailed = false }: { product: AdminDashboard['products'][number]; detailed?: boolean }) {
  const entries = [
    { city: 'МСК', value: product.availability?.moscow || 'По запросу' },
    { city: 'СПб', value: product.availability?.saintPetersburg || 'По запросу' },
  ];
  if (!detailed) return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${availabilityTone(entries[0].value)}`}>{entries[0].value}</span>;
  return <div className="space-y-1">{entries.map((entry) => <p key={entry.city} className="flex items-center gap-1.5 whitespace-nowrap text-[10px]"><span className="w-6 text-ink/35">{entry.city}</span><span className={`rounded-full px-2 py-0.5 font-semibold ${availabilityTone(entry.value)}`}>{entry.value}</span></p>)}</div>;
}

function ProductPrices({ product }: { product: AdminDashboard['products'][number] }) {
  const retail = product.availability?.recommendedRetailPrice || product.price;
  const wholesale = product.availability?.wholesalePrice;
  const earning = wholesale ? retail - wholesale : null;
  const earningPercent = earning !== null && retail > 0 ? Math.round(earning / retail * 100) : null;
  return <div className="space-y-1 whitespace-nowrap text-[10px]">
    <p className="flex items-center justify-between gap-2"><span className="text-ink/40">Розница</span><strong className="text-xs text-ink">{formatMoney(retail)}</strong></p>
    <p className="flex items-center justify-between gap-2"><span className="text-ink/40">Опт</span><span className="font-medium text-ink/65">{wholesale ? formatMoney(wholesale) : 'Нет данных'}</span></p>
    {earning !== null && <p className={`flex items-center justify-between gap-2 border-t border-ink/10 pt-1 ${earning >= 0 ? 'text-emerald-700' : 'text-red-700'}`}><span>Доход</span><strong>{earning >= 0 ? '+' : ''}{formatMoney(earning)}{earningPercent !== null ? ` · ${earningPercent}%` : ''}</strong></p>}
  </div>;
}

function MetricCard({ label, value, note, tone = 'plain' }: {
  label: string; value: string; note: string; tone?: 'plain' | 'dark' | 'warm';
}) {
  const styles = tone === 'dark' ? 'bg-ink text-white' : tone === 'warm' ? 'bg-[#efe4d8]' : 'border border-ink/10 bg-white';
  return <article className={`rounded-[22px] p-5 shadow-card ${styles}`}>
    <p className={`text-xs font-medium ${tone === 'dark' ? 'text-white/55' : 'text-ink/50'}`}>{label}</p>
    <p className="mt-4 font-serif text-3xl tracking-[-.04em]">{value}</p>
    <p className={`mt-2 text-xs ${tone === 'dark' ? 'text-white/55' : 'text-ink/45'}`}>{note}</p>
  </article>;
}

function Overview({ data }: { data: AdminDashboard }) {
  const publicationRate = data.metrics.products ? Math.round(data.metrics.published / data.metrics.products * 100) : 0;
  const healthyImports = data.imports.filter((run) => run.status === 'success').length;
  return <>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Товаров в каталоге" value={data.metrics.products.toLocaleString('ru-RU')} note={`${publicationRate}% опубликовано`} tone="dark" />
      <MetricCard label="Стоимость остатков" value={formatMoney(data.metrics.catalogValue)} note="В розничных ценах" />
      <MetricCard label="Требуют внимания" value={String(data.metrics.outOfStock)} note="Товары без остатка" tone="warm" />
      <MetricCard label="Пользователи" value={data.metrics.users.toLocaleString('ru-RU')} note={`${data.metrics.managers} сотрудников с доступом`} />
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
      <div className="rounded-[22px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div><p className="eyebrow">Контроль каталога</p><h2 className="mt-2 font-serif text-3xl">Последние изменения</h2></div>
          <Link href="/admin?section=catalog" className="text-xs font-semibold text-terracotta hover:underline">Весь каталог →</Link>
        </div>
        <div className="mt-5 divide-y divide-ink/10">
          {data.products.slice(0, 6).map((product) => <div key={product.id} className="grid grid-cols-[1fr_auto] items-center gap-4 py-3.5 sm:grid-cols-[1fr_110px_110px]">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{product.name}</p><p className="mt-1 text-[11px] text-ink/45">{product.sku} · {product.category}</p></div>
            <p className="hidden text-right text-sm sm:block">{formatMoney(product.price)}</p>
            <span className="justify-self-end"><Availability product={product} /></span>
          </div>)}
        </div>
      </div>

      <div className="rounded-[22px] bg-[#efe4d8] p-5 sm:p-6">
        <div className="flex items-start justify-between"><div><p className="eyebrow">Поставщики</p><h2 className="mt-2 font-serif text-3xl">Синхронизация</h2></div><span className="grid h-10 w-10 place-items-center rounded-full bg-white/70 text-lg">↻</span></div>
        <div className="mt-6 rounded-2xl bg-white/65 p-4">
          <div className="flex items-center justify-between"><span className="text-sm font-medium">RealFlame</span><span className="flex items-center gap-2 text-xs"><StatusDot tone={data.imports[0]?.status === 'failed' ? 'red' : 'green'} />{data.imports[0]?.status === 'running' ? 'Выполняется' : 'Подключён'}</span></div>
          <p className="mt-4 text-xs leading-5 text-ink/55">{data.imports[0] ? `Последний обмен ${formatDate(data.imports[0].startedAt)} · обновлено ${data.imports[0].updatedCount}` : 'Запуски синхронизации ещё не зарегистрированы'}</p>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-ink/55"><span>Успешных запусков в истории</span><strong className="text-ink">{healthyImports}</strong></div>
        <Link href="/admin?section=integrations" className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-ink px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-terracotta">Открыть центр интеграций</Link>
      </div>
    </section>
  </>;
}

const catalogHref = (category?: string) => `/admin?section=catalog${category ? `&category=${encodeURIComponent(category)}` : ''}`;

function categoryGroups(categories: AdminCategory[]) {
  const categoryOrder: Record<string, number> = {
    'электрокамины': 1,
    'электроочаги': 2,
    'порталы': 3,
    'биокамины': 4,
    'другое': 5,
  };
  const roots = categories
    .filter((item) => !item.parentId)
    .sort((left, right) => (categoryOrder[left.slug] ?? 99) - (categoryOrder[right.slug] ?? 99)
      || left.name.localeCompare(right.name, 'ru'));
  const children = categories.filter((item) => item.parentId);
  return roots.map((root) => ({
    ...root,
    children: children.filter((item) => item.parentId === root.id),
    total: root.productCount + children.filter((item) => item.parentId === root.id).reduce((sum, item) => sum + item.productCount, 0),
  }));
}

function ProductForm({ categories, error, product }: { categories: AdminCategory[]; error?: string; product?: AdminProductDetails | null }) {
  const groups = categoryGroups(categories);
  const isEditing = Boolean(product);
  const inputClass = 'mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-terracotta';
  return <section className="mb-6 rounded-[22px] border border-terracotta/20 bg-[#f7eee6] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">{isEditing ? 'Карточка товара' : 'Новая карточка'}</p><h2 className="mt-2 font-serif text-3xl">{isEditing ? 'Изменить товар' : 'Добавить товар вручную'}</h2><p className="mt-2 text-sm text-ink/55">{isEditing ? `Вы редактируете «${product?.name}». Изменения сразу попадут в каталог.` : 'Поля со звёздочкой обязательны. Товар можно сохранить скрытым и опубликовать позже.'}</p></div><Link href="/admin?section=catalog" className="rounded-full border border-ink/15 bg-white px-4 py-2 text-xs font-semibold">Закрыть</Link></div>
    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <form action={isEditing ? updateProduct : createManualProduct} className="mt-6 grid gap-5 lg:grid-cols-2">
      {product && <input type="hidden" name="productId" value={product.id} />}
      <label className="text-xs font-semibold text-ink/65">Название *<input className={inputClass} name="name" required minLength={2} defaultValue={product?.name} placeholder="Например, Электрокамин Sofia 26" /></label>
      <label className="text-xs font-semibold text-ink/65">Артикул<input className={inputClass} name="sku" defaultValue={product?.sku} placeholder="Внутренний артикул" /></label>
      <label className="text-xs font-semibold text-ink/65">Категория *<select className={inputClass} name="categoryId" required defaultValue={product?.categoryId || ''}><option value="" disabled>Выберите категорию</option>{groups.map((group) => <optgroup key={group.id} label={group.name}>{group.children.length ? group.children.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : <option value={group.id}>{group.name}</option>}</optgroup>)}</select></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-ink/65">Цена, ₽ *<input className={inputClass} name="price" type="number" min="0" step="0.01" required defaultValue={product?.price} /></label><label className="text-xs font-semibold text-ink/65">Старая цена, ₽<input className={inputClass} name="oldPrice" type="number" min="0" step="0.01" defaultValue={product?.oldPrice ?? ''} /></label></div>
      <label className="text-xs font-semibold text-ink/65 lg:col-span-2">Описание<textarea className={`${inputClass} min-h-28 resize-y`} name="description" defaultValue={product?.description} placeholder="Особенности, материалы и комплектация" /></label>
      <label className="text-xs font-semibold text-ink/65 lg:col-span-2">Изображения{isEditing && product?.images.length ? <div className="mt-2 flex items-end gap-2 overflow-x-auto rounded-2xl border border-ink/10 bg-white/65 p-3">{product.images.slice(0, 8).map((image, index) => <span key={`${image}-${index}`} className={`relative shrink-0 rounded-xl border border-ink/10 bg-white bg-cover bg-center bg-no-repeat shadow-sm ${index === 0 ? 'h-28 w-36' : 'h-20 w-20'}`} style={{ backgroundImage: `url(${JSON.stringify(image).slice(1, -1)})` }} role="img" aria-label={`${index === 0 ? 'Главная фотография' : `Фотография ${index + 1}`}: ${product.name}`}>{index === 0 && <span className="absolute bottom-2 left-2 rounded-full bg-ink/80 px-2 py-1 text-[9px] font-semibold text-white">Главное фото</span>}</span>)}{product.images.length > 8 && <span className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-dashed border-ink/15 bg-white text-xs text-ink/45">+{product.images.length - 8}</span>}</div> : isEditing ? <div className="mt-2 rounded-xl border border-dashed border-ink/15 bg-white/60 px-4 py-5 text-center font-normal text-ink/40">У товара пока нет фотографий</div> : null}<textarea className={`${inputClass} min-h-24 resize-y`} name="images" defaultValue={product?.images.join('\n')} placeholder={'По одной ссылке на строку\nhttps://example.ru/product-front.jpg'} /><span className="mt-1.5 block font-normal text-ink/40">Первое изображение станет обложкой.</span></label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2"><label className="text-xs font-semibold text-ink/65">Остаток, шт.<input className={inputClass} name="stock" type="number" min="0" step="1" defaultValue={product?.stock ?? 0} /></label><label className="text-xs font-semibold text-ink/65">Ширина, мм<input className={inputClass} name="width" type="number" min="0" step="0.1" defaultValue={product?.dimensions.width ?? ''} /></label><label className="text-xs font-semibold text-ink/65">Высота, мм<input className={inputClass} name="height" type="number" min="0" step="0.1" defaultValue={product?.dimensions.height ?? ''} /></label><label className="text-xs font-semibold text-ink/65">Глубина, мм<input className={inputClass} name="depth" type="number" min="0" step="0.1" defaultValue={product?.dimensions.depth ?? ''} /></label></div>
      <label className="text-xs font-semibold text-ink/65">Вес, кг<input className={inputClass} name="weight" type="number" min="0" step="0.01" defaultValue={product?.weight ?? ''} /></label>
      <div className="flex flex-wrap items-center justify-between gap-4 lg:col-span-2"><label className="flex cursor-pointer items-center gap-3 text-sm font-medium"><input className="h-4 w-4 accent-[#b85c38]" type="checkbox" name="isPublished" defaultChecked={product?.isPublished} />Опубликован в каталоге</label><button className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-terracotta">{isEditing ? 'Сохранить изменения' : 'Создать товар'}</button></div>
    </form>
  </section>;
}

function Catalog({ data, query, selectedCategory, mode, error, created, updated, editProduct }: { data: AdminDashboard; query: string; selectedCategory: string; mode?: string; error?: string; created?: boolean; updated?: boolean; editProduct?: AdminProductDetails | null }) {
  const groups = categoryGroups(data.categories);
  return <>
    {mode === 'new' && <ProductForm categories={data.categories} error={error} />}
    {mode === 'edit' && editProduct && <ProductForm categories={data.categories} error={error} product={editProduct} />}
    {mode === 'edit' && !editProduct && <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Товар не найден.</p>}
    {created && <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Товар создан и добавлен в каталог.</p>}
    {updated && <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Изменения товара сохранены.</p>}
    <section className="rounded-[22px] border border-ink/10 bg-white p-5 sm:p-6">
      <div className="grid gap-6 xl:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl bg-[#f4f1ec] p-3 xl:sticky xl:top-24"><Link href={catalogHref()} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold ${!selectedCategory ? 'bg-ink text-white' : 'hover:bg-white'}`}><span>Все товары</span><span className="opacity-55">{data.metrics.products}</span></Link><div className="mt-2 space-y-2">{groups.map((group) => <div key={group.id}><Link href={catalogHref(group.slug)} className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold ${selectedCategory === group.slug ? 'bg-white text-terracotta shadow-sm' : 'text-ink/75 hover:bg-white'}`}><span>{group.name}</span><span className="text-[10px] opacity-45">{group.total}</span></Link>{group.children.length > 0 && <div className="ml-3 mt-1 border-l border-ink/10 pl-2">{group.children.map((item) => <Link key={item.id} href={catalogHref(item.slug)} className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px] ${selectedCategory === item.slug ? 'bg-white font-semibold text-terracotta' : 'text-ink/50 hover:text-ink'}`}><span className="truncate pr-2">{item.name}</span><span className="opacity-50">{item.productCount}</span></Link>)}</div>}</div>)}</div></aside>
        <div className="min-w-0"><div className="sticky top-[72px] z-30 -mx-2 flex flex-wrap gap-2 border-b border-ink/10 bg-white/95 px-2 py-3 backdrop-blur-md"><form className="flex min-w-60 flex-1 gap-2" action="/admin"><input type="hidden" name="section" value="catalog" /><input name="q" defaultValue={query} placeholder="Поиск по всему каталогу" className="min-w-40 flex-1 rounded-full border border-ink/15 px-4 py-2 text-xs outline-none focus:border-terracotta" /><button className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white">Найти</button>{query && <Link href={catalogHref()} className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold">Сбросить</Link>}</form><Link href="/admin?section=catalog&mode=new" className="rounded-full bg-terracotta px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-ink">+ Добавить товар</Link></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="border-b border-ink/10 text-[10px] uppercase tracking-[.16em] text-ink/40"><tr><th className="pb-3 font-semibold">Товар</th><th className="pb-3 font-semibold">Цены</th><th className="pb-3 font-semibold">Остаток</th><th className="pb-3 font-semibold">Статус</th><th className="pb-3 text-right font-semibold">Действие</th><th className="pb-3 pl-5 font-semibold">Комментарий</th></tr></thead><tbody className="divide-y divide-ink/10">{data.products.map((product) => <tr key={product.id}><td className="py-4 pr-4"><div className="flex min-w-0 items-center gap-3">{product.image ? <span className="h-9 w-9 shrink-0 rounded-lg border border-ink/10 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(product.image).slice(1, -1)})` }} role="img" aria-label={`Главная фотография: ${product.name}`} /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-dashed border-ink/15 bg-porcelain text-ink/25" aria-label="Нет фотографии"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m4 17 5-5 4 4 2-2 5 4" /></svg></span>}<div className="min-w-0"><Link href={`/catalog/${product.id}`} className="font-medium underline-offset-4 transition hover:text-terracotta hover:underline">{product.name}</Link><p className="mt-1 text-[11px] text-ink/45">{product.sku} · {[product.parentCategory, product.category].filter(Boolean).join(' / ')}</p></div></div></td><td className="py-4 pr-5"><ProductPrices product={product} /></td><td className="py-4 pr-4"><Availability product={product} detailed /></td><td className="py-4 pr-4"><form action={toggleProductPublication} className="flex items-center gap-2.5"><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="nextPublished" value={String(!product.isPublished)} /><PublicationToggle isPublished={product.isPublished} productName={product.name} /><span className="whitespace-nowrap text-xs">{product.isPublished ? 'Опубликован' : 'Скрыт'}</span></form></td><td className="py-4 text-right"><div className="flex items-center justify-end gap-2"><Link href={`/admin?section=catalog&mode=edit&product=${product.id}`} aria-label="Редактировать товар" title="Редактировать" className="grid h-8 w-8 place-items-center rounded-full border border-ink/15 text-base transition hover:border-terracotta hover:text-terracotta"><span aria-hidden="true">✎</span></Link><ShareProductButton productId={product.id} productName={product.name} /></div></td><td className="max-w-44 py-4 pl-5 text-xs leading-5"><span className={product.visibilityComment ? 'font-medium text-amber-700' : 'text-ink/30'}>{product.visibilityComment || '—'}</span></td></tr>)}</tbody></table>{data.products.length === 0 && <p className="py-12 text-center text-sm text-ink/45">В этой категории ничего не найдено</p>} {data.products.length === 250 && <p className="pt-4 text-center text-[11px] text-ink/40">Показаны первые 250 товаров в заданном порядке. Используйте категории или поиск.</p>}</div>
        </div>
      </div>
    </section>
  </>;
}

function UserStatus({ user }: { user: AdminDashboard['users'][number] }) {
  return <span className={`inline-flex min-w-24 justify-center rounded-full px-3 py-1.5 text-xs font-medium ${user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{user.isActive ? 'Активен' : 'Заблокирован'}</span>;
}

function UserAccessRow({ user, currentUserId, events, showLog }: { user: AdminDashboard['users'][number]; currentUserId: string; events: AdminDashboard['audit']; showLog: boolean }) {
  const isCurrent = user.id === currentUserId;
  return <><details className="group rounded-2xl border border-ink/10 bg-white open:border-terracotta/25 open:bg-[#fffaf6]">
    <summary className="grid cursor-pointer list-none items-center gap-3 p-4 marker:hidden md:grid-cols-[1fr_190px_190px_auto]"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{user.fullName}</p>{isCurrent && <span className="rounded-full bg-terracotta/10 px-2 py-0.5 text-[9px] font-bold uppercase text-terracotta">Вы</span>}</div><p className="mt-1 truncate text-xs text-ink/45">{user.email} · последний вход: {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'ещё не входил'}</p></div><span className="inline-flex min-w-40 justify-center rounded-full bg-ink/5 px-3 py-1.5 text-xs text-ink/60">{roleNames[user.role]}</span><UserStatus user={user} /><span className="flex items-center gap-2"><Link href={showLog ? '/admin?section=team' : `/admin?section=team&logUser=${user.id}`} aria-label="Журнал действий пользователя" title="Журнал действий" className={`grid h-8 w-8 place-items-center rounded-full border transition ${showLog ? 'border-terracotta bg-terracotta/10 text-terracotta' : 'border-ink/15 hover:border-terracotta hover:text-terracotta'}`}><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg></Link><span className="grid h-8 w-8 place-items-center rounded-full border border-ink/15 text-base transition group-open:border-terracotta group-open:text-terracotta" aria-label="Редактировать пользователя">✎</span></span></summary>
    <div className="border-t border-ink/10 p-4"><form action={updateUser} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><input type="hidden" name="userId" value={user.id} /><label className="text-xs font-semibold text-ink/65">Имя<input required minLength={2} name="fullName" defaultValue={user.fullName} className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta" /></label><label className="text-xs font-semibold text-ink/65">Email<input required type="email" maxLength={254} name="email" defaultValue={user.email} className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta" /></label><label className="text-xs font-semibold text-ink/65">Новый пароль<input minLength={8} name="password" type="password" autoComplete="new-password" placeholder="Оставьте пустым" className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta" /></label><label className="text-xs font-semibold text-ink/65">Роль<select name="role" defaultValue={user.role} disabled={isCurrent} className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta disabled:bg-porcelain">{Object.entries(roleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="flex items-end gap-2"><select name="isActive" defaultValue={String(user.isActive)} disabled={isCurrent} aria-label="Доступ пользователя" className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta disabled:bg-porcelain"><option value="true">Доступ открыт</option><option value="false">Доступ закрыт</option></select><button className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-terracotta">Сохранить</button></div></form>{!isCurrent && <form action={deleteUser} className="mt-4 flex justify-end border-t border-ink/10 pt-4"><input type="hidden" name="userId" value={user.id} /><DeleteUserButton userName={user.fullName} /></form>}</div>
  </details>{showLog && <div className="mx-3 -mt-1 rounded-b-2xl border border-t-0 border-terracotta/20 bg-[#fffaf6] px-4 pb-2 pt-3"><div className="divide-y divide-ink/10">{events.slice(0, 50).map((event) => <div key={event.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]"><div className="min-w-0"><p className="text-xs font-medium">{actionNames[event.action] || event.action}</p><p className="mt-1 truncate text-[10px] text-ink/40">{event.entityLabel}</p></div><time className="whitespace-nowrap text-[10px] text-ink/40">{formatDate(event.createdAt)}</time></div>)}{events.length === 0 && <p className="py-5 text-center text-sm text-ink/40">Действий пока нет</p>}</div></div>}</>;
}

function Team({ data, currentUserId, userError, userCreated, userUpdated, userDeleted, logUserId }: { data: AdminDashboard; currentUserId: string; userError?: string; userCreated?: boolean; userUpdated?: boolean; userDeleted?: boolean; logUserId?: string }) {
  const employees = data.users.filter((user) => user.role !== 'customer');
  const customers = data.users.filter((user) => user.role === 'customer');
  return <section className="rounded-[22px] border border-ink/10 bg-white p-5 sm:p-6">
    {userCreated && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Пользователь создан. Передайте ему email и пароль безопасным способом.</p>}
    {userUpdated && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Изменения пользователя сохранены.</p>}
    {userDeleted && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Пользователь удалён, его активные сессии завершены.</p>}
    {userError && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{userError}</p>}
    <details className="group mb-6" open={userError ? true : undefined}><summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-xs font-semibold text-white marker:hidden transition hover:bg-terracotta">Создать пользователя<span className="grid h-5 w-5 place-items-center rounded-full bg-white/15 text-sm font-normal transition group-open:rotate-45">+</span></summary><form action={createUser} className="mt-3 grid gap-4 rounded-2xl border border-ink/10 bg-[#f7eee6] p-4 md:grid-cols-2 xl:grid-cols-5"><label className="text-xs font-semibold text-ink/65">Имя<input required minLength={2} name="fullName" autoComplete="off" className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta" /></label><label className="text-xs font-semibold text-ink/65">Email<input required type="email" maxLength={254} name="email" autoComplete="email" placeholder="ivan@company.ru" className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta" /></label><label className="text-xs font-semibold text-ink/65">Пароль<input required minLength={8} name="password" type="password" autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta" /></label><label className="text-xs font-semibold text-ink/65">Роль<select name="role" defaultValue="sales_manager" className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta">{Object.entries(roleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="flex items-end gap-2"><select name="isActive" defaultValue="true" aria-label="Доступ пользователя" className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta"><option value="true">Доступ открыт</option><option value="false">Доступ закрыт</option></select><button className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-terracotta">Создать</button></div></form></details>
    <div className="flex items-center justify-between border-b border-ink/10 pb-3"><h2 className="text-sm font-semibold">Сотрудники</h2><span className="text-xs text-ink/40">{employees.length}</span></div>
    <div className="mt-3 space-y-3">{employees.map((user) => <UserAccessRow key={user.id} user={user} currentUserId={currentUserId} events={data.audit.filter((event) => event.actorUserId === user.id)} showLog={logUserId === user.id} />)}{employees.length === 0 && <p className="rounded-2xl bg-porcelain p-6 text-center text-sm text-ink/45">Сотрудников пока нет</p>}</div>
    <div className="mt-8 flex items-center justify-between border-b border-ink/10 pb-3"><h2 className="text-sm font-semibold">Зарегистрированные пользователи</h2><span className="text-xs text-ink/40">{customers.length}</span></div>
    <div className="mt-3 space-y-3">{customers.map((user) => <UserAccessRow key={user.id} user={user} currentUserId={currentUserId} events={data.audit.filter((event) => event.actorUserId === user.id)} showLog={logUserId === user.id} />)}{customers.length === 0 && <p className="rounded-2xl bg-porcelain p-6 text-center text-sm text-ink/45">Зарегистрированных пользователей пока нет</p>}</div>
  </section>;
}

function Integrations({ data }: { data: AdminDashboard }) {
  return <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
    <section className="rounded-[22px] bg-ink p-6 text-white"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-gold-light">Активный источник</p><h2 className="mt-3 font-serif text-4xl">RealFlame</h2><p className="mt-4 text-sm leading-6 text-white/55">Импортирует карточки, рекомендованные цены, доступность, характеристики, галерею и совместимость очагов с порталами.</p><div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-white/45">Статус</p><p className="mt-2 flex items-center gap-2 text-sm font-medium"><StatusDot tone={data.imports[0]?.status === 'failed' ? 'red' : 'green'} />{data.imports[0]?.status === 'failed' ? 'Нужна проверка' : 'Работает'}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-white/45">Расписание</p><p className="mt-2 text-sm font-medium">Раз в час</p></div></div><p className="mt-6 text-xs leading-5 text-white/45">Ручной запуск намеренно выполняется только серверной командой, чтобы ключи и импорт нельзя было вызвать из браузера.</p></section>
    <section className="rounded-[22px] border border-ink/10 bg-white p-5 sm:p-6"><p className="eyebrow">Журнал обмена</p><h2 className="mt-2 font-serif text-3xl">Последние запуски</h2><div className="mt-5 divide-y divide-ink/10">{data.imports.map((run) => <div key={run.id} className="grid grid-cols-[1fr_auto] gap-4 py-4"><div><p className="flex items-center gap-2 text-sm font-medium"><StatusDot tone={run.status === 'success' ? 'green' : run.status === 'running' ? 'amber' : 'red'} />{run.supplier}</p><p className="mt-1 text-xs text-ink/45">{formatDate(run.startedAt)} · создано {run.createdCount}, обновлено {run.updatedCount}</p>{run.errorMessage && <p className="mt-2 text-xs text-red-700">{run.errorMessage}</p>}</div><span className="text-[10px] font-bold uppercase tracking-wider text-ink/40">{run.status === 'success' ? 'Успешно' : run.status === 'running' ? 'В работе' : 'Ошибка'}</span></div>)}{data.imports.length === 0 && <p className="py-10 text-center text-sm text-ink/45">История появится после первого импорта.</p>}</div></section>
  </div>;
}

function Security({ data }: { data: AdminDashboard }) {
  return <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
    <section className="rounded-[22px] border border-ink/10 bg-white p-5 sm:p-6"><p className="eyebrow">Аудит</p><h2 className="mt-2 font-serif text-3xl">Критичные изменения</h2><div className="mt-5 divide-y divide-ink/10">{data.audit.map((event) => <div key={event.id} className="grid grid-cols-[1fr_auto] gap-4 py-4"><div><p className="text-sm font-medium">{actionNames[event.action] || event.action}</p><p className="mt-1 text-xs text-ink/45">{event.actorName} · {event.entityLabel}</p></div><time className="text-[11px] text-ink/40">{formatDate(event.createdAt)}</time></div>)}{data.audit.length === 0 && <p className="py-10 text-center text-sm leading-6 text-ink/45">Журнал начнёт заполняться после применения миграции и первого изменения.</p>}</div></section>
    <section className="rounded-[22px] bg-[#efe4d8] p-6"><span className="grid h-11 w-11 place-items-center rounded-full bg-white/75 text-xl">◉</span><h2 className="mt-5 font-serif text-3xl">Правила безопасности</h2><ul className="mt-5 space-y-4 text-sm leading-6 text-ink/65"><li>• Все административные действия проверяют роль на сервере.</li><li>• Суперадминистратор не может заблокировать или понизить собственный аккаунт.</li><li>• Пароли хранятся как криптографические хэши, сессии — только в защищённых cookie.</li><li>• Изменения каталога и ролей записываются в аудит.</li></ul></section>
  </div>;
}

export default async function AdminPage({ searchParams }: { searchParams: { section?: string; q?: string; category?: string; mode?: string; product?: string; error?: string; created?: string; updated?: string; userError?: string; userCreated?: string; userUpdated?: string; userDeleted?: string; logUser?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/account/login?next=/admin');
  if (user.role !== 'super_admin') redirect('/account?access=denied');

  const section = navigation.some((item) => item.id === searchParams.section) ? searchParams.section as Section : 'overview';
  const activeCategory = searchParams.q?.trim() ? undefined : searchParams.category;
  const data = await getAdminDashboard({ category: activeCategory, query: searchParams.q });
  const editProduct = searchParams.mode === 'edit' && searchParams.product
    ? await getAdminProduct(searchParams.product)
    : null;
  const sectionTitle = navigation.find((item) => item.id === section)?.label || 'Обзор';
  const activeCategoryData = activeCategory
    ? data.categories.find((category) => category.slug === activeCategory)
    : null;

  return <main className="min-h-screen bg-[#f4f1ec]">
    <div className="container-page py-6 sm:py-8">
      <div className="grid gap-6 lg:grid-cols-[76px_1fr]">
        <aside className="relative z-50 h-fit overflow-visible rounded-[22px] bg-ink p-3 text-white lg:sticky lg:top-24">
          <div className="grid place-items-center border-b border-white/10 pb-4 pt-1" title="Панель управления Ykamina.ru"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 font-serif text-xl text-gold-light">Y</span></div>
          <nav className="mt-3 grid grid-cols-5 gap-1 lg:grid-cols-1">{navigation.map((item) => <Link key={item.id} href={`/admin?section=${item.id}`} aria-label={item.label} className={`group relative flex h-11 items-center justify-center rounded-xl transition ${section === item.id ? 'bg-white text-ink' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}><AdminNavIcon section={item.id} /><span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[60] hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-[11px] font-semibold text-white shadow-xl group-hover:block group-focus-visible:block">{item.label}</span></Link>)}</nav>
          <div className="group relative mt-4 hidden border-t border-white/10 pt-4 lg:grid lg:place-items-center"><Link href="/account" aria-label="Открыть профиль" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xs font-bold text-gold-light transition hover:bg-white/20">{user.fullName.trim().charAt(0).toUpperCase()}</Link><div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[60] hidden min-w-48 -translate-y-1/2 rounded-xl bg-ink px-3 py-2.5 text-white shadow-xl group-hover:block"><p className="text-xs font-semibold">{user.fullName}</p><p className="mt-1 text-[10px] text-white/50">{user.email}</p><p className="mt-2 text-[10px] font-semibold text-gold-light">Открыть профиль →</p></div></div>
          <form action={logout} className="group relative mt-2 hidden lg:grid lg:place-items-center"><button aria-label="Выйти из аккаунта" className="grid h-10 w-10 place-items-center rounded-xl text-white/55 transition hover:bg-red-500/15 hover:text-red-200"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 5H5v14h5" /><path d="M14 8l4 4-4 4M18 12H9" /></svg></button><span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[60] hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-[11px] font-semibold text-white shadow-xl group-hover:block">Выйти из аккаунта</span></form>
          <form action={logout} className="mt-3 lg:hidden"><button className="w-full rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/70">Выйти из аккаунта</button></form>
        </aside>

        <div className="min-w-0">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4"><nav className="eyebrow flex flex-wrap items-center gap-2" aria-label="Навигация по админке"><Link href="/admin?section=overview" className="transition hover:text-ink hover:underline">Суперадминистратор</Link><span aria-hidden="true">·</span><Link href={`/admin?section=${section}`} className="transition hover:text-ink hover:underline">{sectionTitle}</Link>{section === 'catalog' && activeCategoryData && <><span aria-hidden="true">·</span><Link href={catalogHref(activeCategoryData.slug)} className="transition hover:text-ink hover:underline">{activeCategoryData.name}</Link></>}</nav><div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[11px] font-medium shadow-card"><StatusDot tone={data.databaseConnected ? 'green' : 'amber'} />{data.databaseConnected ? 'Система работает' : 'Демонстрационные данные'}</div></header>
          {section === 'overview' && <Overview data={data} />}
          {section === 'catalog' && <Catalog data={data} query={searchParams.q || ''} selectedCategory={activeCategory || ''} mode={searchParams.mode} error={searchParams.error} created={searchParams.created === '1'} updated={searchParams.updated === '1'} editProduct={editProduct} />}
          {section === 'team' && <Team data={data} currentUserId={user.id} userError={searchParams.userError} userCreated={searchParams.userCreated === '1'} userUpdated={searchParams.userUpdated === '1'} userDeleted={searchParams.userDeleted === '1'} logUserId={searchParams.logUser} />}
          {section === 'integrations' && <Integrations data={data} />}
          {section === 'security' && <Security data={data} />}
        </div>
      </div>
    </div>
  </main>;
}
