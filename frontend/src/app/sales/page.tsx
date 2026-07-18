import Link from 'next/link';
import { ProductCard } from '@/components/product-card';
import { getSaleProducts } from '@/lib/catalog-repository';
import { BackButton } from '@/components/back-button';

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const products = await getSaleProducts();
  return <section className="container-page py-10 sm:py-14"><BackButton /><div className="mb-10 mt-6"><p className="eyebrow">Выгодные предложения</p><h1 className="mt-3 font-serif text-5xl tracking-[-.05em] sm:text-6xl">Камины по доступным ценам</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-ink/60">Специальные цены на выбранные модели.</p></div>{products.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-6">{products.map((product) => { const discount = product.oldPrice ? Math.round((1 - product.price / product.oldPrice) * 100) : 0; return <ProductCard product={product} badge={discount ? `−${discount}% акция` : 'Акция'} key={product.id} />; })}</div> : <div className="rounded-xl border border-[#e9e5df] bg-porcelain p-8"><p className="font-serif text-2xl">Новые предложения уже готовятся</p><Link href="/catalog" className="mt-5 inline-flex text-sm font-semibold text-terracotta hover:underline">Перейти в каталог →</Link></div>}</section>;
}
