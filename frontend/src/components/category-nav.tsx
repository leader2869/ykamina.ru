import Link from 'next/link';
import { CatalogCategory } from '@/lib/catalog-repository';

export function CategoryNav({ categories, active }: { categories: CatalogCategory[]; active?: string }) {
  if (!categories.length) return null;
  return <nav className="mb-10 overflow-x-auto rounded-2xl bg-white p-5"><div className="flex min-w-max gap-8">{categories.map((category) => <div key={category.slug}><Link href={`/catalog?category=${category.slug}`} className={`font-serif text-xl transition ${active === category.slug ? 'text-terracotta' : 'text-ink hover:text-terracotta'}`}>{category.name}</Link><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">{category.children.map((child) => <Link key={child.slug} href={`/catalog?category=${child.slug}`} className={`text-xs ${active === child.slug ? 'font-semibold text-terracotta' : 'text-ink/55 hover:text-terracotta'}`}>{child.name} <span className="text-ink/35">{child.count}</span></Link>)}</div></div>)}</div></nav>;
}
