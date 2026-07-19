'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cartChangedEvent, readCart } from '@/lib/cart';

function CartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6" /><circle cx="9.5" cy="19.5" r="1" /><circle cx="17.5" cy="19.5" r="1" /></svg>;
}

export function CartLink() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(readCart().reduce((sum, item) => sum + item.quantity, 0));
    update();
    window.addEventListener(cartChangedEvent, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(cartChangedEvent, update); window.removeEventListener('storage', update); };
  }, []);
  return <Link href="/cart" aria-label={`Корзина, товаров: ${count}`} title="Корзина" className="relative grid h-10 w-10 place-items-center rounded-full text-ink transition hover:bg-terracotta/10 hover:text-terracotta"><span className="h-5 w-5"><CartIcon /></span><span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[9px] font-bold text-white">{count}</span></Link>;
}
