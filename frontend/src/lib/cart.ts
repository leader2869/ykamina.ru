'use client';

export type CartItem = { productId: string; quantity: number };

export const cartStorageKey = 'ykamina:cart';
export const cartChangedEvent = 'ykamina:cart-change';

export function readCart(): CartItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(cartStorageKey) || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is CartItem => typeof item?.productId === 'string' && Number.isInteger(item?.quantity))
      .map((item) => ({ ...item, quantity: Math.min(10, Math.max(1, item.quantity)) }));
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  localStorage.setItem(cartStorageKey, JSON.stringify(items));
  window.dispatchEvent(new Event(cartChangedEvent));
}

export function addToCart(productId: string) {
  const items = readCart();
  const existing = items.find((item) => item.productId === productId);
  if (existing) existing.quantity = Math.min(10, existing.quantity + 1);
  else items.push({ productId, quantity: 1 });
  writeCart(items);
}
