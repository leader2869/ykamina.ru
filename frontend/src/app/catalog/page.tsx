import { CatalogClient } from '@/components/catalog-client';
import { getCategories, getProducts } from '@/lib/catalog-repository';
import { BackButton } from '@/components/back-button';
import { CategoryNav } from '@/components/category-nav';

export const dynamic = 'force-dynamic';

export default async function CatalogPage({ searchParams }: { searchParams: { category?: string } }) { const [products, categories] = await Promise.all([getProducts(searchParams.category), getCategories()]); return <section className="container-page py-7 sm:py-10"><BackButton /><div className="mt-3"><h1 className="font-serif text-5xl tracking-[-.05em] sm:text-6xl">Каталог каминов</h1></div><div className="mt-6"><CategoryNav categories={categories} active={searchParams.category} /></div><CatalogClient products={products} /></section>; }
