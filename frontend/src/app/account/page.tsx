import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

const roleName = { customer: 'Клиент', sales_manager: 'Менеджер отдела продаж', super_admin: 'Суперадминистратор' };

export default async function AccountPage({ searchParams }: { searchParams: { access?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/account/login');
  if (user.role === 'sales_manager') redirect('/manager');
  if (user.role === 'super_admin') redirect('/admin');
  return <main className="container-page py-12 sm:py-16">{searchParams.access === 'denied' && <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Для входа в панель управления нужны права суперадминистратора.</p>}<div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">Личный кабинет</p><h1 className="mt-3 font-serif text-4xl tracking-[-.04em] sm:text-5xl">Здравствуйте, {user.fullName.split(' ')[0]}!</h1></div><span className="rounded-full bg-terracotta/10 px-3 py-1.5 text-xs font-semibold text-terracotta">{roleName[user.role]}</span></div><section className="mt-10 grid gap-5 md:grid-cols-2"><div className="rounded-2xl border border-[#e9e5df] bg-white p-6"><h2 className="font-serif text-3xl">Ваши данные</h2><dl className="mt-5 space-y-3 text-sm"><div><dt className="text-ink/50">Email</dt><dd className="mt-1 font-medium">{user.email}</dd></div><div><dt className="text-ink/50">Телефон</dt><dd className="mt-1 font-medium">{user.phone}</dd></div><div><dt className="text-ink/50">Адрес доставки</dt><dd className="mt-1 font-medium">{user.deliveryAddress}</dd></div></dl></div><div className="rounded-2xl bg-porcelain p-6"><h2 className="font-serif text-3xl">Заказы</h2><p className="mt-4 text-sm leading-6 text-ink/65">История заказов и персональные предложения появятся здесь после запуска оформления заказа.</p><Link href="/catalog" className="mt-6 inline-flex text-sm font-semibold text-terracotta hover:underline">Перейти в каталог →</Link></div></section></main>;
}
