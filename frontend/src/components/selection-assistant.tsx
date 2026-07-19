'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const DISMISSED_KEY = 'ykamina_selection_assistant_dismissed_at';
const SUBMITTED_KEY = 'ykamina_selection_assistant_submitted_at';
const DAY = 24 * 60 * 60 * 1000;
const MONTH = 30 * DAY;

const interests = [
  ['electric-fireplace', 'Электрокамин'],
  ['hearth', 'Очаг или портал'],
  ['bio-fireplace', 'Биокамин'],
  ['unsure', 'Пока не определился'],
] as const;

function recentlyStored(key: string, interval: number) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && Date.now() - value < interval;
  } catch {
    return false;
  }
}

export function SelectionAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hiddenArea = ['/admin', '/manager', '/account', '/checkout'].some((path) =>
    pathname.startsWith(path),
  );

  useEffect(() => {
    if (hiddenArea || recentlyStored(SUBMITTED_KEY, MONTH) || recentlyStored(DISMISSED_KEY, DAY))
      return;
    const timer = window.setTimeout(() => setOpen(true), 10000);
    return () => window.clearTimeout(timer);
  }, [hiddenArea]);

  if (hiddenArea) return null;

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {}
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, page: pathname }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось отправить заявку');
      setSubmitted(true);
      try {
        window.localStorage.setItem(SUBMITTED_KEY, String(Date.now()));
      } catch {}
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить заявку');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {!open && !submitted && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[90] flex items-center gap-3 rounded-full bg-ink px-4 py-3 text-left text-white shadow-[0_18px_50px_-18px_rgba(0,0,0,.65)] transition hover:-translate-y-0.5 hover:bg-terracotta sm:bottom-7 sm:right-7 sm:px-5"
          aria-label="Открыть помощь в выборе камина"
        >
          <span
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xl"
            aria-hidden="true"
          >
            ✦
          </span>
          <span>
            <strong className="block text-xs">Помочь с выбором?</strong>
            <span className="mt-0.5 hidden text-[10px] text-white/55 sm:block">
              Подскажем подходящий вариант
            </span>
          </span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/25 p-0 backdrop-blur-[2px] sm:items-end sm:justify-end sm:bg-transparent sm:p-7 sm:backdrop-blur-none"
          onMouseDown={(event) => event.target === event.currentTarget && close()}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="selection-assistant-title"
            className="relative w-full overflow-hidden rounded-t-[28px] bg-[#fbfaf8] shadow-[0_24px_80px_-18px_rgba(0,0,0,.5)] sm:max-w-[390px] sm:rounded-[28px] sm:border sm:border-black/[.07]"
          >
            <div className="bg-ink px-6 pb-6 pt-5 text-white">
              <div className="flex items-start justify-between gap-5">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full bg-terracotta text-xl"
                    aria-hidden="true"
                  >
                    ✦
                  </span>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[.18em] text-gold-light">
                      Помощник Ykamina.ru
                    </p>
                    <p className="mt-1 text-[10px] text-white/50">Менеджер ответит лично</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Закрыть"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xl text-white/70 transition hover:bg-white/20 hover:text-white"
                >
                  ×
                </button>
              </div>
              <h2
                id="selection-assistant-title"
                className="mt-6 font-serif text-[30px] leading-[1.05] tracking-[-.035em]"
              >
                Поможем выбрать камин
              </h2>
              <p className="mt-3 text-xs leading-5 text-white/60">
                Оставьте контакты — уточним задачу, проверим совместимость и предложим подходящие
                модели.
              </p>
            </div>

            {submitted ? (
              <div className="px-6 py-8 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-2xl text-emerald-700">
                  ✓
                </span>
                <h3 className="mt-5 font-serif text-2xl">Заявка отправлена</h3>
                <p className="mt-3 text-xs leading-5 text-black/50">
                  Менеджер получил ваши контакты и свяжется с вами в рабочее время.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-6 w-full rounded-full bg-ink py-3.5 text-xs font-semibold text-white"
                >
                  Продолжить покупки
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="grid gap-3 px-6 py-6">
                <label className="text-[10px] font-semibold text-black/55">
                  Как к вам обращаться?
                  <input
                    required
                    name="name"
                    autoComplete="name"
                    minLength={2}
                    maxLength={120}
                    placeholder="Ваше имя"
                    className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-normal outline-none transition focus:border-terracotta"
                  />
                </label>
                <label className="text-[10px] font-semibold text-black/55">
                  Номер телефона
                  <input
                    required
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={32}
                    placeholder="+7 999 123-45-67"
                    className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-normal outline-none transition focus:border-terracotta"
                  />
                </label>
                <label className="text-[10px] font-semibold text-black/55">
                  Что хотите подобрать?
                  <select
                    name="interest"
                    defaultValue="unsure"
                    className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-normal outline-none transition focus:border-terracotta"
                  >
                    {interests.map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute -left-[9999px] h-px w-px opacity-0"
                />
                <label className="mt-1 flex items-start gap-2.5 text-[9px] leading-4 text-black/45">
                  <input
                    required
                    name="consent"
                    value="yes"
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#a9492f]"
                  />
                  <span>
                    Согласен на обработку имени и телефона для обратной связи.{' '}
                    <Link href="/requisites" className="underline underline-offset-2">
                      О компании
                    </Link>
                  </span>
                </label>
                {error && (
                  <p
                    role="alert"
                    className="rounded-xl bg-red-50 px-4 py-3 text-[10px] leading-4 text-red-700"
                  >
                    {error}
                  </p>
                )}
                <button
                  disabled={saving}
                  className="mt-1 rounded-full bg-terracotta py-3.5 text-xs font-semibold text-white transition hover:bg-ink disabled:cursor-wait disabled:opacity-60"
                >
                  {saving ? 'Отправляем…' : 'Получить консультацию'}
                </button>
                <p className="text-center text-[9px] text-black/35">
                  Без спама. Только помощь с выбором и заказом.
                </p>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
