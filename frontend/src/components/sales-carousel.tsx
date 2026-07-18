'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ProductCard } from '@/components/product-card';
import { Product } from '@/lib/products';

export function SalesCarousel({ products }: { products: Product[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const copies = Math.min(3, products.length);
  const carouselProducts = useMemo(() => products.length > 3 ? [...products.slice(-copies), ...products, ...products.slice(0, copies)] : products, [copies, products]);
  const cardStep = () => {
    const card = rail.current?.firstElementChild as HTMLElement | null;
    return card ? card.getBoundingClientRect().width + 24 : 0;
  };

  useEffect(() => {
    const element = rail.current;
    const step = cardStep();
    if (element && step) element.scrollLeft = copies * step;
  }, [copies, products]);

  const move = (direction: number) => {
    const element = rail.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.9, behavior: 'smooth' });
  };

  const loopOnScroll = () => {
    const element = rail.current;
    const step = cardStep();
    if (!element || !step || products.length <= 3) return;
    const start = copies * step;
    const end = (copies + products.length) * step;
    if (element.scrollLeft < start - step * 0.5) element.scrollLeft += products.length * step;
    if (element.scrollLeft > end - step * 0.5) element.scrollLeft -= products.length * step;
  };

  return <div className="relative"><div ref={rail} onScroll={loopOnScroll} className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{carouselProducts.map((product, index) => { const discount = product.oldPrice ? Math.round((1 - product.price / product.oldPrice) * 100) : 0; return <div className="w-[min(84vw,360px)] shrink-0 snap-start sm:w-[calc(50%-12px)] xl:w-[calc((100%-48px)/3)]" key={`${product.id}-${index}`}><ProductCard product={product} badge={discount ? `−${discount}% акция` : 'Акция'} /></div>; })}</div>{products.length > 3 && <><button aria-label="Предыдущие предложения" onClick={() => move(-1)} className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-ink/15 bg-white/95 text-lg shadow-md transition hover:border-terracotta hover:text-terracotta sm:-left-5">←</button><button aria-label="Следующие предложения" onClick={() => move(1)} className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-ink/15 bg-white/95 text-lg shadow-md transition hover:border-terracotta hover:text-terracotta sm:-right-5">→</button></>}</div>;
}
