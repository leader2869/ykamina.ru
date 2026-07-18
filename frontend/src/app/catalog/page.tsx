import { CatalogClient } from '@/components/catalog-client';
import { getProducts } from '@/lib/catalog-repository';
import { getCategories } from '@/lib/catalog-repository';
import { CategoryNav } from '@/components/category-nav';

export const dynamic = 'force-dynamic';

export default async function CatalogPage({ searchParams }: { searchParams: { category?: string } }) { const [products, categories] = await Promise.all([getProducts(searchParams.category), getCategories()]); return <section className="container-page py-7 sm:py-10"><div><h1 className="font-serif text-5xl tracking-[-.05em] sm:text-6xl">Каталог каминов</h1><p className="mt-3 text-sm text-ink/60">{products.length} моделей, чтобы найти тепло именно для вашего дома</p></div><div className="mt-6"><CategoryNav categories={categories} active={searchParams.category} /></div><CatalogClient products={products} /></section>; }
