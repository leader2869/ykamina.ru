import { AuthForm } from '@/components/auth-form';

export default function LoginPage() { return <main className="container-page py-12 sm:py-16"><section className="mx-auto max-w-xl rounded-2xl border border-[#e9e5df] bg-white p-6 sm:p-10"><p className="eyebrow">Личный кабинет</p><h1 className="mt-3 font-serif text-4xl tracking-[-.04em] sm:text-5xl">Вход</h1><AuthForm mode="login" /></section></main>; }
