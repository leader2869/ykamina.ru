'use client';

import { useEffect, useState } from 'react';

type Collection = 'favorites' | 'compare';
const storageKey = (collection: Collection) => `ykamina:${collection}`;

function read(collection: Collection) {
  try { return JSON.parse(localStorage.getItem(storageKey(collection)) || '[]') as string[]; } catch { return []; }
}

function Icon({ kind }: { kind: Collection }) {
  return kind === 'favorites'
    ? <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z" /></svg>
    : <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7" /><path d="M3 20h18" /></svg>;
}

export function ProductActions({ productId, placement = 'card' }: { productId: string; placement?: 'card' | 'detail' }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  useEffect(() => { setFavorites(read('favorites')); setCompare(read('compare')); }, []);
  const toggle = (collection: Collection) => {
    const current = collection === 'favorites' ? favorites : compare;
    const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
    localStorage.setItem(storageKey(collection), JSON.stringify(next));
    collection === 'favorites' ? setFavorites(next) : setCompare(next);
  };
  const buttonClass = placement === 'card' ? 'grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow-sm transition hover:text-terracotta' : 'grid h-11 w-11 place-items-center rounded-full border border-ink/15 bg-white transition hover:border-terracotta hover:text-terracotta';
  return <div className={placement === 'card' ? 'absolute right-3 top-3 z-10 flex gap-2' : 'flex gap-2'}>
    {(['favorites', 'compare'] as Collection[]).map((collection) => { const active = (collection === 'favorites' ? favorites : compare).includes(productId); const label = collection === 'favorites' ? 'Добавить в избранное' : 'Добавить к сравнению'; return <button key={collection} type="button" title={label} aria-label={label} aria-pressed={active} onClick={() => toggle(collection)} className={`${buttonClass} ${active ? 'text-terracotta' : 'text-ink'}`}><Icon kind={collection} /></button>; })}
  </div>;
}
