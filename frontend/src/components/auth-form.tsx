'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

export function AuthForm({ mode }: { mode: 'register' | 'login' }) {
  const isRegistration = mode === 'register';
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setLoading(true);
    const fields = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) { setError(result.error || 'Что-то пошло не так.'); return; }
    const requestedPath = new URLSearchParams(window.location.search).get('next');
    const safePath = requestedPath?.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/account';
    window.location.assign(safePath);
  }
  const inputClass = 'mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-terracotta';
  return <form onSubmit={submit} className="mt-8 grid gap-4"><div className="grid gap-4">{isRegistration && <label className="text-sm font-medium">ФИО<input required name="fullName" autoComplete="name" className={inputClass} /></label>}{isRegistration && <label className="text-sm font-medium">Телефон<input required name="phone" inputMode="tel" autoComplete="tel" placeholder="+7 (___) ___-__-__" className={inputClass} /></label>}<label className="text-sm font-medium">Email<input required type="email" name="email" autoComplete="email" className={inputClass} /></label>{isRegistration && <label className="text-sm font-medium">Дата рождения<input required type="date" name="birthDate" autoComplete="bday" className={inputClass} /></label>}{isRegistration && <label className="text-sm font-medium">Адрес доставки<textarea required name="deliveryAddress" autoComplete="street-address" rows={3} className={inputClass} /></label>}<label className="text-sm font-medium">Пароль<input required minLength={8} type="password" name="password" autoComplete={isRegistration ? 'new-password' : 'current-password'} className={inputClass} /><span className="mt-1 block text-xs font-normal text-ink/50">Минимум 8 символов</span></label></div>{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<button disabled={loading} className="mt-2 rounded-full bg-terracotta px-5 py-3 text-sm font-medium text-white transition hover:bg-terracotta-dark disabled:cursor-wait disabled:opacity-70">{loading ? 'Подождите…' : isRegistration ? 'Создать личный кабинет' : 'Войти'}</button><p className="text-center text-sm text-ink/60">{isRegistration ? <>Уже есть кабинет? <Link href="/account/login" className="font-medium text-terracotta hover:underline">Войти</Link></> : <>Нет аккаунта? <Link href="/account/register" className="font-medium text-terracotta hover:underline">Зарегистрироваться</Link></>}</p></form>;
}
