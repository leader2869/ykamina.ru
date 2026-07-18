'use client';

import Link from 'next/link';

const items = [
  { href: '/delivery', label: 'Доставка и оплата', note: 'Условия, сроки и способы оплаты' },
  { href: '/operating-rules', label: 'Правила эксплуатации', note: 'Безопасное использование камина' },
  { href: '/faq', label: 'Вопросы и ответы', note: 'Помощь с выбором и заказом' },
];

export function BuyersMenu() {
  return <div className="group relative py-7"><span className="flex cursor-default items-center gap-1.5 text-[13px] font-medium text-ink/75 transition group-hover:text-terracotta">Покупателям<span className="text-[10px] transition group-hover:rotate-180">⌄</span></span><div className="pointer-events-none absolute right-0 top-full z-50 w-72 translate-y-2 rounded-2xl border border-[#e9e5df] bg-white p-2 opacity-0 shadow-[0_20px_50px_-25px_rgba(29,29,27,.35)] transition duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">{items.map((item) => <Link href={item.href} key={item.href} className="block rounded-xl px-4 py-3 transition hover:bg-porcelain"><span className="block text-sm text-ink">{item.label}</span><span className="mt-1 block text-[11px] leading-4 text-ink/55">{item.note}</span></Link>)}</div></div>;
}
