'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { CartItem, readCart } from '@/lib/cart';
import { Product, formatPrice } from '@/lib/products';

export function CheckoutClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<'tbank' | 'yandex' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setItems(readCart());
    fetch('/api/products').then((response) => response.json()).then(({ data }) => setProducts(data || [])).finally(() => setLoading(false));
  }, []);
  const rows = items.map((item) => ({ item, product: products.find((product) => product.id === item.productId) })).filter((row): row is { item: CartItem; product: Product } => Boolean(row.product));
  const total = rows.reduce((sum, row) => sum + row.product.price * row.item.quantity, 0);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const provider = submitter?.value === 'yandex' ? 'yandex' : 'tbank';
    setPaying(provider);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(provider === 'yandex' ? '/api/payments/yandex/init' : '/api/payments/tbank/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, name: form.get('name'), email: form.get('email'), phone: form.get('phone'), city: form.get('city'), comment: form.get('comment') }) });
      const result = await response.json();
      if (!response.ok || !result.paymentUrl) throw new Error(result.error || 'Не удалось перейти к оплате');
      window.location.assign(result.paymentUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось перейти к оплате');
      setPaying(null);
    }
  };

  if (loading) return <p className="mt-8 text-ink/55">Загружаем заказ…</p>;
  if (!rows.length) return <div className="mt-8 rounded-2xl bg-white p-8"><p className="font-serif text-2xl">В корзине пока нет товаров</p><Link href="/catalog" className="mt-5 inline-block rounded-full bg-ink px-5 py-3 text-sm text-white">Перейти в каталог</Link></div>;

  return <form onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]"><div className="rounded-2xl bg-white p-6 sm:p-8"><h2 className="font-serif text-2xl">Контактные данные</h2><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm">Имя<input required name="name" autoComplete="name" className="mt-2 w-full rounded-lg border border-ink/15 px-3 py-3" /></label><label className="text-sm">Телефон<input required name="phone" type="tel" autoComplete="tel" className="mt-2 w-full rounded-lg border border-ink/15 px-3 py-3" /></label><label className="text-sm">Email<input required name="email" type="email" autoComplete="email" className="mt-2 w-full rounded-lg border border-ink/15 px-3 py-3" /></label><label className="text-sm">Город доставки<input required name="city" autoComplete="address-level2" className="mt-2 w-full rounded-lg border border-ink/15 px-3 py-3" /></label></div><label className="mt-4 block text-sm">Комментарий к заказу<textarea name="comment" className="mt-2 min-h-24 w-full rounded-lg border border-ink/15 px-3 py-3" /></label></div><aside className="h-fit rounded-2xl bg-ink p-6 text-white"><h2 className="font-serif text-2xl">Ваш заказ</h2><ul className="mt-5 space-y-3 text-sm">{rows.map(({ item, product }) => <li key={product.id} className="flex justify-between gap-4"><span className="text-white/70">{product.name} × {item.quantity}</span><span className="shrink-0">{formatPrice(product.price * item.quantity)}</span></li>)}</ul><div className="mt-5 flex justify-between border-t border-white/15 pt-5 font-serif text-xl"><span>Итого</span><span>{formatPrice(total)}</span></div>{error && <p role="alert" className="mt-4 rounded-lg bg-red-500/20 p-3 text-sm text-red-100">{error}</p>}<button name="provider" value="tbank" disabled={Boolean(paying)} className="mt-6 w-full rounded-full bg-terracotta px-4 py-3 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-60">{paying === 'tbank' ? 'Создаем платеж…' : 'Оплатить картой'}</button>{process.env.NEXT_PUBLIC_YANDEX_SPLIT_ENABLED === 'true' && <button name="provider" value="yandex" disabled={Boolean(paying)} className="mt-3 w-full rounded-full bg-[#ffdc60] px-4 py-3 text-sm font-semibold text-black disabled:cursor-wait disabled:opacity-60">{paying === 'yandex' ? 'Открываем Сплит…' : 'Оплатить частями в Сплит'}</button>}<p className="mt-4 text-xs leading-5 text-white/50">Вы перейдете на защищенную платежную форму выбранного сервиса. Данные карты не передаются магазину.</p></aside></form>;
}
