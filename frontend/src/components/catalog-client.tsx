'use client';

import { useEffect, useMemo, useState } from 'react';
import { CatalogFilters, Filters } from '@/components/filters';
import { ProductCard } from '@/components/product-card';
import { compareCatalogProducts, Product } from '@/lib/products';

const initialFilters: CatalogFilters = { types: [], minPrice: '', maxPrice: '', width: '', height: '' };
const pageSize = 24;

function matchesDimension(value: number | undefined, range: string) {
  if (!range) return true;
  if (!value) return false;
  if (range === 'compact') return value < 600;
  if (range === 'medium') return value >= 600 && value < 1000;
  return value >= 1000;
}

export function CatalogClient({ products }: { products: Product[] }) {
  const [filters, setFilters] = useState<CatalogFilters>(initialFilters);
  const [sort, setSort] = useState('popular');
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const priceRange = useMemo(() => products.length ? ({ min: Math.min(...products.map((product) => product.price)), max: Math.max(...products.map((product) => product.price)) }) : ({ min: 0, max: 0 }), [products]);
  const types = useMemo(() => Array.from(new Set(products.map((product) => product.type).filter((type): type is string => Boolean(type)))).sort((a, b) => a.localeCompare(b, 'ru')), [products]);
  const filtered = useMemo(() => products.filter((product) => {
    const min = Number(filters.minPrice || 0); const max = Number(filters.maxPrice || 0);
    return (!filters.types.length || filters.types.includes(product.type)) && (!min || product.price >= min) && (!max || product.price <= max) && matchesDimension(product.dimensionsData?.width, filters.width) && matchesDimension(product.dimensionsData?.height, filters.height);
  }).sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : compareCatalogProducts(a, b)), [products, filters, sort]);
  useEffect(() => setVisibleCount(pageSize), [filters, sort, products]);
  return <div className="mt-8 grid gap-8 md:grid-cols-[260px_1fr]">
    <Filters value={filters} onChange={setFilters} onReset={() => setFilters(initialFilters)} priceRange={priceRange} types={types} />
    <div><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink/60">Найдено: <span className="font-medium text-ink">{filtered.length}</span></p><label className="flex items-center gap-2 text-sm text-ink/60">Сортировать:<select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-terracotta"><option value="popular">по наличию и наполнению</option><option value="low">сначала дешевле</option><option value="high">сначала дороже</option></select></label></div>{filtered.length ? <><div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{filtered.slice(0, visibleCount).map((product) => <ProductCard product={product} key={product.id} />)}</div>{visibleCount < filtered.length && <button onClick={() => setVisibleCount((count) => count + pageSize)} className="mx-auto mt-10 block rounded-full border border-ink/20 px-6 py-3 text-sm font-medium transition hover:border-terracotta hover:text-terracotta">Показать ещё</button>}</> : <div className="rounded-2xl border border-dashed border-ink/20 px-6 py-14 text-center"><p className="font-serif text-2xl">Ничего не найдено</p><p className="mt-2 text-sm text-ink/60">Измените параметры фильтра или сбросьте их.</p><button onClick={() => setFilters(initialFilters)} className="mt-5 text-sm font-medium text-terracotta hover:underline">Сбросить фильтры</button></div>}</div>
  </div>;
}
