import { CatalogClient } from '@/components/catalog-client';
import { getCatalogPage, getCategories } from '@/lib/catalog-repository';
import { BackButton } from '@/components/back-button';
import { CategoryNav } from '@/components/category-nav';

export const dynamic = 'force-dynamic';

export default async function CatalogPage({ searchParams }: { searchParams: { category?: string } }) {
  const [catalog, categories] = await Promise.all([getCatalogPage({ category: searchParams.category }, true), getCategories()]);
  return <section className="container-page py-7 sm:py-10"><BackButton /><div className="mt-3"><h1 className="font-serif text-5xl tracking-[-.05em] sm:text-6xl">Каталог каминов</h1></div><div className="mt-6"><CategoryNav categories={categories} active={searchParams.category} /></div><CatalogClient initial={catalog} category={searchParams.category} /></section>;
}
