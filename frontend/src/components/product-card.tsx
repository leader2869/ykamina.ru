import Image from 'next/image';
import Link from 'next/link';
import { Product, formatPrice } from '@/lib/products';
import { ProductActions } from '@/components/product-actions';

export function ProductCard({ product }: { product: Product }) {
  return <article className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-xl">
    <div className="relative"><Link href={`/catalog/${product.id}`} className="relative block aspect-[4/3] overflow-hidden bg-white"><Image src={product.image} alt={product.name} fill className="object-contain p-3 transition duration-500 group-hover:scale-105" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" /></Link><ProductActions productId={product.id} /></div>
    <div className="flex flex-1 flex-col p-5"><p className="text-xs uppercase tracking-[.14em] text-terracotta">{product.type}</p><Link href={`/catalog/${product.id}`} className="mt-2 block min-h-[5.25rem] font-serif text-xl font-semibold leading-7 text-ink hover:text-terracotta"><span className="line-clamp-3">{product.name}</span></Link>{product.article && <p className="mt-2 text-xs text-ink/45">Артикул: {product.article}</p>}<p className="mt-1 min-h-5 text-sm text-ink/55">{product.dimensions}</p><div className="mt-auto flex items-end justify-between gap-3 pt-5"><div><p className="font-semibold text-ink">{formatPrice(product.price)}</p>{product.oldPrice && <p className="text-sm text-ink/40 line-through">{formatPrice(product.oldPrice)}</p>}</div><button className="rounded-full bg-ink px-4 py-2 text-sm text-white transition hover:bg-terracotta">В корзину</button></div></div>
  </article>;
}
