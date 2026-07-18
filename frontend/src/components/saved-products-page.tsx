'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Product } from '@/lib/products';
import { ProductCard } from '@/components/product-card';

const read = () => { try { return JSON.parse(localStorage.getItem('ykamina:favorites') || '[]') as string[]; } catch { return []; } };

export function SavedProductsPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    const refresh = () => setIds(read());
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('ykamina:collection-change', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('ykamina:collection-change', refresh); };
  }, []);
  useEffect(() => { fetch('/api/products').then((response) => response.json()).then((result) => setProducts(result.data || [])).catch(() => setProducts([])); }, []);
  const selected = products.filter((product) => ids.includes(product.id));
  return <main className="container-page py-10 sm:py-14"><Link href="/catalog" className="text-sm text-ink/55 transition hover:text-terracotta">← В каталог</Link><div className="mt-5 flex items-end justify-between gap-5"><div><p className="eyebrow">Ваш выбор</p><h1 className="mt-2 font-serif text-4xl tracking-[-.04em] sm:text-6xl">Избранное</h1></div>{ids.length > 0 && <p className="pb-1 text-sm text-ink/55">{ids.length} {ids.length === 1 ? 'товар' : ids.length < 5 ? 'товара' : 'товаров'}</p>}</div>{ids.length === 0 ? <section className="mt-10 rounded-2xl border border-[#e9e5df] bg-white p-8 text-center sm:p-12"><h2 className="font-serif text-3xl">Пока здесь пусто</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink/60">Добавляйте понравившиеся камины с помощью иконок на карточках товаров.</p><Link href="/catalog" className="mt-6 inline-flex rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-terracotta">Перейти в каталог</Link></section> : <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{selected.map((product) => <ProductCard key={product.id} product={product} />)}</div>}</main>;
}
