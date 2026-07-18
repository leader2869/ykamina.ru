'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductCard } from '@/components/product-card';
import { Product } from '@/lib/products';

export function CompatibleProducts({ title, products }: { title: string; products: Product[] }) {
  const [showAll, setShowAll] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const copies = Math.min(3, products.length);
  const carouselProducts = useMemo(() => products.length > 3 ? [...products.slice(-copies), ...products, ...products.slice(0, copies)] : products, [copies, products]);
  const step = () => {
    const firstCard = rail.current?.firstElementChild as HTMLElement | null;
    return firstCard ? firstCard.getBoundingClientRect().width + 24 : 0;
  };
  useEffect(() => {
    const element = rail.current;
    const cardStep = step();
    if (element && cardStep) element.scrollLeft = copies * cardStep;
  }, [copies, products]);
  const move = (direction: number) => {
    const element = rail.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.9, behavior: 'smooth' });
  };
  const loopOnScroll = () => {
    const element = rail.current;
    const cardStep = step();
    if (!element || !cardStep || products.length <= 3) return;
    const startOfRealCards = copies * cardStep;
    const endOfRealCards = (copies + products.length) * cardStep;
    if (element.scrollLeft < startOfRealCards - cardStep * 0.5) element.scrollLeft += products.length * cardStep;
    if (element.scrollLeft > endOfRealCards - cardStep * 0.5) element.scrollLeft -= products.length * cardStep;
  };
  return <section className="mt-16 border-t border-ink/10 pt-10">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[.18em] text-terracotta">Соберите комплект</p><h2 className="mt-2 font-serif text-3xl">{title}</h2></div>{products.length > 3 && <button onClick={() => setShowAll((value) => !value)} className="rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium transition hover:border-terracotta hover:text-terracotta">{showAll ? 'Свернуть' : `Показать все (${products.length})`}</button>}</div>
    {showAll ? <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{products.map((item) => <ProductCard key={item.id} product={item} />)}</div> : <div className="relative"><div ref={rail} onScroll={loopOnScroll} className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{carouselProducts.map((item, index) => <div key={`${item.id}-${index}`} className="w-[min(84vw,360px)] shrink-0 snap-start sm:w-[calc(50%-12px)] xl:w-[calc((100%-48px)/3)]"><ProductCard product={item} /></div>)}</div>{products.length > 3 && <><button aria-label="Предыдущие товары" onClick={() => move(-1)} className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-ink/15 bg-white/95 text-lg shadow-md transition hover:border-terracotta hover:text-terracotta sm:-left-5">←</button><button aria-label="Следующие товары" onClick={() => move(1)} className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-ink/15 bg-white/95 text-lg shadow-md transition hover:border-terracotta hover:text-terracotta sm:-right-5">→</button></>}</div>}
  </section>;
}
