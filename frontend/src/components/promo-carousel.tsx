'use client';

import { useState } from 'react';

const slides = [
  { kicker: 'Летняя коллекция', title: 'До 15% на очаги для загородного дома', text: 'Подберём камин, рассчитаем монтаж и доставим в любой регион.', image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1800&q=85' },
  { kicker: 'Яндекс Сплит', title: 'Тепло дома — в комфортном ритме', text: 'Разделите стоимость покупки на несколько платежей без переплаты.', image: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1800&q=85' },
];

export function PromoCarousel() { const [active, setActive] = useState(0); const slide = slides[active]; return <section className="relative min-h-[530px] overflow-hidden bg-ink"><div className="absolute inset-0 bg-cover bg-center opacity-50 transition-all duration-500" style={{ backgroundImage: `url(${slide.image})` }} /><div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-transparent" /><div className="container-page relative flex min-h-[530px] items-end pb-20 pt-24"><div className="max-w-2xl text-white"><p className="mb-4 text-xs uppercase tracking-[.22em] text-gold-light">{slide.kicker}</p><h1 className="font-serif text-4xl leading-tight sm:text-5xl lg:text-6xl">{slide.title}</h1><p className="mt-6 max-w-lg text-base leading-7 text-white/75">{slide.text}</p><a href="/catalog" className="mt-8 inline-block rounded-full bg-terracotta px-6 py-3 text-sm font-medium transition hover:bg-terracotta-dark">Выбрать камин</a></div></div><div className="absolute bottom-8 right-6 flex gap-2 sm:right-12">{slides.map((_, index) => <button key={index} aria-label={`Акция ${index + 1}`} onClick={() => setActive(index)} className={`h-2.5 rounded-full transition ${active === index ? 'w-8 bg-white' : 'w-2.5 bg-white/45'}`} />)}</div></section>; }
