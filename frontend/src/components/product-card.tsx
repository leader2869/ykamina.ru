import Image from 'next/image';
import Link from 'next/link';
import { Product, formatPrice } from '@/lib/products';
import { ProductActions } from '@/components/product-actions';
import { AddToCartButton } from '@/components/add-to-cart-button';
import { DolyameCardPrice } from '@/components/dolyame-promo';

export function ProductCard({ product, badge }: { product: Product; badge?: string }) {
  return <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-[#e9e5df] bg-white transition duration-300 hover:-translate-y-1 hover:shadow-card">
    <div className="relative border-b border-[#f0ede8]"><Link href={`/catalog/${product.id}`} className="relative block aspect-[4/3] overflow-hidden bg-white"><Image src={product.image} alt={product.name} fill className="object-contain p-4 transition duration-500 group-hover:scale-[1.035]" sizes="(max-width: 768px) 50vw, (max-width: 1200px) 50vw, 25vw" /></Link>{badge && <span className="absolute left-4 top-4 rounded-full bg-terracotta px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-white">{badge}</span>}<ProductActions productId={product.id} /></div>
    <div className="flex flex-1 flex-col p-5"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-terracotta">{product.type}</p><Link href={`/catalog/${product.id}`} className="mt-2 block min-h-[4.25rem] font-serif text-[21px] font-semibold leading-[1.05] tracking-[-.025em] text-ink transition hover:text-terracotta"><span className="line-clamp-2">{product.name}</span></Link><div className="mt-auto border-t border-[#eeeae4] pt-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-[10px] text-ink/45">Цена от</p><p className="mt-0.5 font-semibold text-ink">{formatPrice(product.price)}</p>{product.oldPrice && <p className="text-xs text-ink/40 line-through">{formatPrice(product.oldPrice)}</p>}</div><DolyameCardPrice firstPayment={formatPrice(product.price * .25)} /></div><AddToCartButton productId={product.id} className="mt-4 w-full rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-white transition hover:bg-terracotta">В корзину</AddToCartButton></div></div>
  </article>;
}
