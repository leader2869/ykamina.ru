'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CartItem, readCart, writeCart } from '@/lib/cart';
import { Product, formatPrice } from '@/lib/products';

export function CartPageClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const cart = readCart();
    setItems(cart);
    fetch('/api/products').then((response) => response.json()).then(({ data }) => setProducts(data || [])).finally(() => setLoaded(true));
  }, []);

  const rows = useMemo(() => items.map((item) => ({ item, product: products.find((product) => product.id === item.productId) })).filter((row): row is { item: CartItem; product: Product } => Boolean(row.product)), [items, products]);
  const total = rows.reduce((sum, row) => sum + row.product.price * row.item.quantity, 0);
  const update = (productId: string, quantity: number) => {
    const next = quantity <= 0 ? items.filter((item) => item.productId !== productId) : items.map((item) => item.productId === productId ? { ...item, quantity: Math.min(10, quantity) } : item);
    setItems(next);
    writeCart(next);
  };

  if (!loaded) return <p className="mt-8 text-ink/55">Загружаем корзину…</p>;
  if (!rows.length) return <div className="mt-8 rounded-2xl border border-dashed border-ink/20 bg-white p-10 text-center"><p className="font-serif text-2xl">Ваша корзина пока пуста</p><p className="mt-2 text-ink/60">Добавьте камин из каталога — он появится здесь.</p><Link className="mt-6 inline-block rounded-full bg-ink px-5 py-3 text-sm text-white" href="/catalog">Перейти в каталог</Link></div>;

  return <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]"><div className="space-y-4">{rows.map(({ item, product }) => <article key={product.id} className="flex gap-4 rounded-2xl bg-white p-4 sm:items-center"><div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-ink/10 bg-white"><Image src={product.image} alt="" fill className="object-contain p-2" sizes="96px" /></div><div className="min-w-0 flex-1"><Link href={`/catalog/${product.id}`} className="font-serif text-xl hover:text-terracotta">{product.name}</Link><p className="mt-1 text-sm text-ink/55">{formatPrice(product.price)}</p><div className="mt-3 flex items-center gap-3"><button type="button" aria-label="Уменьшить количество" onClick={() => update(product.id, item.quantity - 1)} className="grid h-8 w-8 place-items-center rounded-full border border-ink/15">−</button><span className="min-w-5 text-center text-sm">{item.quantity}</span><button type="button" aria-label="Увеличить количество" onClick={() => update(product.id, item.quantity + 1)} className="grid h-8 w-8 place-items-center rounded-full border border-ink/15">+</button><button type="button" onClick={() => update(product.id, 0)} className="ml-2 text-xs text-ink/45 underline">Удалить</button></div></div><p className="hidden font-medium sm:block">{formatPrice(product.price * item.quantity)}</p></article>)}</div><aside className="h-fit rounded-2xl bg-ink p-6 text-white"><h2 className="font-serif text-2xl">Итого</h2><p className="mt-5 font-serif text-3xl">{formatPrice(total)}</p><Link href="/checkout" className="mt-6 block rounded-full bg-terracotta px-4 py-3 text-center text-sm font-medium text-white">Оформить заказ</Link><p className="mt-4 text-xs leading-5 text-white/55">Оплата пройдет на защищенной платежной форме Т‑Банка.</p></aside></div>;
}
