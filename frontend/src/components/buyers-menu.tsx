'use client';

import Link from 'next/link';
import { useState } from 'react';

const items = [
  { href: '/delivery', label: 'Доставка и оплата', note: 'Условия, сроки и способы оплаты' },
  { href: '/operating-rules', label: 'Правила эксплуатации', note: 'Безопасное использование камина' },
  { href: '/faq', label: 'Вопросы и ответы', note: 'Помощь с выбором и заказом' },
];

export function BuyersMenu() {
  const [open, setOpen] = useState(false);
  return <div className="relative py-7"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-1.5 text-[13px] font-medium text-ink/75 transition hover:text-terracotta">Покупателям<span className={`text-[10px] transition ${open ? 'rotate-180' : ''}`}>⌄</span></button>{open && <div className="absolute right-0 top-full z-50 w-64 rounded-2xl border border-[#e9e5df] bg-white p-2 shadow-[0_20px_50px_-25px_rgba(29,29,27,.35)]">{items.map((item) => <Link href={item.href} onClick={() => setOpen(false)} key={item.href} className="block rounded-xl px-4 py-3 transition hover:bg-porcelain"><span className="block text-sm text-ink">{item.label}</span><span className="mt-1 block text-[11px] leading-4 text-ink/55">{item.note}</span></Link>)}</div>}</div>;
}
