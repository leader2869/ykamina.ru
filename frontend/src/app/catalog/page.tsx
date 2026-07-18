import { CatalogClient } from '@/components/catalog-client';
import { getProducts } from '@/lib/catalog-repository';
import { getCategories } from '@/lib/catalog-repository';
import { CategoryNav } from '@/components/category-nav';

export const dynamic = 'force-dynamic';

export default async function CatalogPage({ searchParams }: { searchParams: { category?: string } }) { const [products, categories] = await Promise.all([getProducts(searchParams.category), getCategories()]); return <section className="container-page py-12 sm:py-16"><p className="text-sm text-ink/50">Главная / Каталог</p><div className="mt-4"><h1 className="font-serif text-4xl sm:text-5xl">Каталог каминов</h1><p className="mt-3 text-ink/60">{products.length} моделей с фотографиями</p></div><div className="mt-9"><CategoryNav categories={categories} active={searchParams.category} /></div><CatalogClient products={products} /></section>; }
