import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AdminDashboard, getAdminDashboard } from '@/lib/admin';
import { toggleProductPublication, updateUserAccess } from './actions';

type Section = 'overview' | 'catalog' | 'team' | 'integrations' | 'security';

const navigation: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Обзор', icon: '⌂' },
  { id: 'catalog', label: 'Каталог', icon: '◇' },
  { id: 'team', label: 'Команда и доступы', icon: '◎' },
  { id: 'integrations', label: 'Интеграции', icon: '↻' },
  { id: 'security', label: 'Безопасность', icon: '◉' },
];

const roleNames = {
  customer: 'Клиент',
  sales_manager: 'Менеджер продаж',
  super_admin: 'Суперадминистратор',
};

const actionNames: Record<string, string> = {
  'product.published': 'Опубликовал товар',
  'product.unpublished': 'Снял товар с публикации',
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
            <span className={`justify-self-end rounded-full px-2.5 py-1 text-[10px] font-semibold ${product.stock > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{product.stock > 0 ? `${product.stock} шт.` : 'Нет в наличии'}</span>
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

function Catalog({ data, query }: { data: AdminDashboard; query: string }) {
  const products = data.products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="rounded-[22px] border border-ink/10 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Ассортимент</p><h2 className="mt-2 font-serif text-3xl">Управление каталогом</h2><p className="mt-2 text-sm text-ink/50">Публикация, цены и контроль остатков поставщиков.</p></div>
      <form className="flex gap-2" action="/admin"><input type="hidden" name="section" value="catalog" /><input name="q" defaultValue={query} placeholder="Название или артикул" className="w-52 rounded-full border border-ink/15 px-4 py-2 text-xs outline-none focus:border-terracotta" /><button className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white">Найти</button></form></div>
    <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-ink/10 text-[10px] uppercase tracking-[.16em] text-ink/40"><tr><th className="pb-3 font-semibold">Товар</th><th className="pb-3 font-semibold">Цена</th><th className="pb-3 font-semibold">Остаток</th><th className="pb-3 font-semibold">Статус</th><th className="pb-3 text-right font-semibold">Действие</th></tr></thead><tbody className="divide-y divide-ink/10">{products.map((product) => <tr key={product.id}><td className="py-4"><p className="font-medium">{product.name}</p><p className="mt-1 text-[11px] text-ink/45">{product.sku} · {product.category}</p></td><td className="py-4">{formatMoney(product.price)}</td><td className="py-4"><span className={product.stock === 0 ? 'font-semibold text-red-700' : ''}>{product.stock} шт.</span></td><td className="py-4"><span className="flex items-center gap-2 text-xs"><StatusDot tone={product.isPublished ? 'green' : 'gray'} />{product.isPublished ? 'Опубликован' : 'Скрыт'}</span></td><td className="py-4 text-right"><form action={toggleProductPublication}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="nextPublished" value={String(!product.isPublished)} /><button className="rounded-full border border-ink/15 px-3 py-1.5 text-[11px] font-semibold transition hover:border-terracotta hover:text-terracotta">{product.isPublished ? 'Снять' : 'Опубликовать'}</button></form></td></tr>)}</tbody></table>{products.length === 0 && <p className="py-12 text-center text-sm text-ink/45">Ничего не найдено</p>}</div>
  </section>;
}

function Team({ data, currentUserId }: { data: AdminDashboard; currentUserId: string }) {
  return <section className="rounded-[22px] border border-ink/10 bg-white p-5 sm:p-6">
    <div><p className="eyebrow">Управление доступом</p><h2 className="mt-2 font-serif text-3xl">Команда и пользователи</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/50">Назначайте роли по принципу минимально необходимых прав. Клиенты не видят служебный раздел, менеджеры работают с продажами, суперадминистраторы управляют системой.</p></div>
    <div className="mt-6 space-y-3">{data.users.map((user) => {
      const isCurrent = user.id === currentUserId;
      return <form action={updateUserAccess} key={user.id} className="grid items-center gap-3 rounded-2xl border border-ink/10 p-4 md:grid-cols-[1fr_190px_120px_auto]">
        <input type="hidden" name="userId" value={user.id} /><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{user.fullName}</p>{isCurrent && <span className="rounded-full bg-terracotta/10 px-2 py-0.5 text-[9px] font-bold uppercase text-terracotta">Вы</span>}</div><p className="mt-1 truncate text-xs text-ink/45">{user.email} · с {formatDate(user.createdAt)}</p></div>
        <select name="role" defaultValue={user.role} disabled={isCurrent} className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs disabled:bg-porcelain">{Object.entries(roleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select name="isActive" defaultValue={String(user.isActive)} disabled={isCurrent} className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs disabled:bg-porcelain"><option value="true">Активен</option><option value="false">Заблокирован</option></select>
        <button disabled={isCurrent} className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white transition hover:bg-terracotta disabled:cursor-not-allowed disabled:opacity-30">Сохранить</button>
      </form>;
    })}{data.users.length === 0 && <p className="rounded-2xl bg-porcelain p-8 text-center text-sm text-ink/50">Пользователи появятся после подключения базы данных.</p>}</div>
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

export default async function AdminPage({ searchParams }: { searchParams: { section?: string; q?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/account/login?next=/admin');
  if (user.role !== 'super_admin') redirect('/account?access=denied');

  const section = navigation.some((item) => item.id === searchParams.section) ? searchParams.section as Section : 'overview';
  const data = await getAdminDashboard();
  const sectionTitle = navigation.find((item) => item.id === section)?.label || 'Обзор';

  return <main className="min-h-screen bg-[#f4f1ec]">
    <div className="container-page py-6 sm:py-8">
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="h-fit rounded-[22px] bg-ink p-4 text-white lg:sticky lg:top-24">
          <div className="border-b border-white/10 px-3 pb-5 pt-2"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-gold-light">Панель управления</p><p className="mt-2 font-serif text-2xl">Ykamina<span className="text-terracotta-light">.ru</span></p></div>
          <nav className="mt-4 grid gap-1">{navigation.map((item) => <Link key={item.id} href={`/admin?section=${item.id}`} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition ${section === item.id ? 'bg-white text-ink' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}><span className="w-4 text-center text-base">{item.icon}</span>{item.label}</Link>)}</nav>
          <div className="mt-6 rounded-2xl bg-white/10 p-3"><p className="truncate text-xs font-semibold">{user.fullName}</p><p className="mt-1 truncate text-[10px] text-white/45">{user.email}</p><Link href="/account" className="mt-3 inline-flex text-[10px] font-semibold text-gold-light hover:underline">Открыть профиль →</Link></div>
        </aside>

        <div className="min-w-0">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Суперадминистратор · {sectionTitle}</p><h1 className="mt-2 font-serif text-4xl tracking-[-.04em] sm:text-5xl">Добрый день, {user.fullName.split(' ')[0]}</h1><p className="mt-2 text-sm text-ink/50">Здесь собраны решения, влияющие на продажи и работу всей системы.</p></div><div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[11px] font-medium shadow-card"><StatusDot tone={data.databaseConnected ? 'green' : 'amber'} />{data.databaseConnected ? 'Система работает' : 'Демонстрационные данные'}</div></header>
          {section === 'overview' && <Overview data={data} />}
          {section === 'catalog' && <Catalog data={data} query={searchParams.q || ''} />}
          {section === 'team' && <Team data={data} currentUserId={user.id} />}
          {section === 'integrations' && <Integrations data={data} />}
          {section === 'security' && <Security data={data} />}
        </div>
      </div>
    </div>
  </main>;
}
