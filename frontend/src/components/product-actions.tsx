'use client';

import { useEffect, useState } from 'react';

const storageKey = 'ykamina:favorites';

function read() {
  try { return JSON.parse(localStorage.getItem(storageKey) || '[]') as string[]; } catch { return []; }
}

function HeartIcon({ active }: { active: boolean }) {
  return <svg className="h-5 w-5" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z" /></svg>;
}

export function ProductActions({ productId, placement = 'card' }: { productId: string; placement?: 'card' | 'detail' }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => { setFavorites(read()); }, []);
  const toggle = () => {
    const next = favorites.includes(productId) ? favorites.filter((id) => id !== productId) : [...favorites, productId];
    localStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent(new Event('ykamina:collection-change'));
    setFavorites(next);
  };
  const buttonClass = placement === 'card' ? 'grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow-sm transition hover:text-terracotta' : 'grid h-11 w-11 place-items-center rounded-full border border-ink/15 bg-white transition hover:border-terracotta hover:text-terracotta';
  const active = favorites.includes(productId);
  const label = active ? 'Убрать из избранного' : 'Добавить в избранное';
  return <div className={placement === 'card' ? 'absolute right-3 top-3 z-10' : ''}><button type="button" title={label} aria-label={label} aria-pressed={active} onClick={toggle} className={`${buttonClass} ${active ? 'text-terracotta' : 'text-ink'}`}><HeartIcon active={active} /></button></div>;
}
