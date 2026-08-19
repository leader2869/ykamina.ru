'use client';

import { useEffect, useRef, useState } from 'react';
import { CatalogFilters, Filters } from '@/components/filters';
import { ProductCard } from '@/components/product-card';
import { CatalogPage } from '@/lib/catalog-repository';

const initialFilters: CatalogFilters = { types: [], minPrice: '', maxPrice: '', width: '', height: '' };

function queryString(category: string | undefined, filters: CatalogFilters, sort: string, page: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: '24', sort });
  if (category) params.set('category', category);
  filters.types.forEach((type) => params.append('type', type));
  if (filters.minPrice) params.set('minPrice', filters.minPrice);
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
  if (filters.width) params.set('width', filters.width);
  if (filters.height) params.set('height', filters.height);
  return params.toString();
}

export function CatalogClient({ initial, category }: { initial: CatalogPage; category?: string }) {
  const [filters, setFilters] = useState<CatalogFilters>(initialFilters);
  const [sort, setSort] = useState('popular');
  const [products, setProducts] = useState(initial.data);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const firstRender = useRef(true);
  const request = useRef<AbortController | null>(null);
  const facets = initial.facets || { priceRange: { min: 0, max: 0 }, types: [] };

  const load = async (nextPage: number, append = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/products?${queryString(category, filters, sort, nextPage)}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Не удалось загрузить каталог');
      const result = await response.json() as CatalogPage;
      setProducts((current) => append ? [...current, ...result.data] : result.data);
      setTotal(result.total);
      setPage(result.page);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError('Не удалось загрузить товары. Попробуйте ещё раз.');
    } finally {
      if (request.current === controller) setLoading(false);
    }
  };

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = window.setTimeout(() => { void load(1); }, 300);
    return () => window.clearTimeout(timer);
    // load intentionally uses the current filter and sort state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, category]);

  useEffect(() => () => request.current?.abort(), []);

  return <div className="mt-8 grid gap-8 md:grid-cols-[260px_1fr]">
    <Filters value={filters} onChange={setFilters} onReset={() => setFilters(initialFilters)} priceRange={facets.priceRange} types={facets.types} />
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink/60">Найдено: <span className="font-medium text-ink">{total}</span>{loading && <span className="ml-2 text-ink/40">обновляем…</span>}</p><label className="flex items-center gap-2 text-sm text-ink/60">Сортировать:<select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-terracotta"><option value="popular">по наличию и наполнению</option><option value="low">сначала дешевле</option><option value="high">сначала дороже</option></select></label></div>
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {products.length ? <><div className={`grid gap-6 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${loading && page === 1 ? 'opacity-55' : ''}`}>{products.map((product) => <ProductCard product={product} key={product.id} />)}</div>{products.length < total && <button disabled={loading} onClick={() => void load(page + 1, true)} className="mx-auto mt-10 block rounded-full border border-ink/20 px-6 py-3 text-sm font-medium transition hover:border-terracotta hover:text-terracotta disabled:cursor-wait disabled:opacity-50">{loading ? 'Загружаем…' : 'Показать ещё'}</button>}</> : !loading && <div className="rounded-2xl border border-dashed border-ink/20 px-6 py-14 text-center"><p className="font-serif text-2xl">Ничего не найдено</p><p className="mt-2 text-sm text-ink/60">Измените параметры фильтра или сбросьте их.</p><button onClick={() => setFilters(initialFilters)} className="mt-5 text-sm font-medium text-terracotta hover:underline">Сбросить фильтры</button></div>}
    </div>
  </div>;
}
