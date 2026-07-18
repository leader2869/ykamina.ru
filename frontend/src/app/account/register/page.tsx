import { AuthForm } from '@/components/auth-form';

export default function RegisterPage() { return <main className="container-page py-12 sm:py-16"><section className="mx-auto max-w-2xl rounded-2xl border border-[#e9e5df] bg-white p-6 sm:p-10"><p className="eyebrow">Личный кабинет</p><h1 className="mt-3 font-serif text-4xl tracking-[-.04em] sm:text-5xl">Регистрация</h1><p className="mt-4 text-sm leading-6 text-ink/65">Сохраните данные для быстрого оформления заказа и получения персональной помощи.</p><AuthForm mode="register" /></section></main>; }
