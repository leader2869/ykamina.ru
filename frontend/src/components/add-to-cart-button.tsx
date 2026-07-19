'use client';

import { useState } from 'react';
import { addToCart } from '@/lib/cart';

export function AddToCartButton({ productId, className, children }: { productId: string; className: string; children: React.ReactNode }) {
  const [added, setAdded] = useState(false);

  return <button type="button" className={className} onClick={() => {
    addToCart(productId);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  }}>{added ? 'Добавлено' : children}</button>;
}
