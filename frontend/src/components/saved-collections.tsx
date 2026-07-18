'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

function readFavorites() {
  try { return JSON.parse(localStorage.getItem('ykamina:favorites') || '[]') as string[]; } catch { return []; }
}

function HeartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z" /></svg>;
}

export function SavedCollections() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const refresh = () => setCount(readFavorites().length);
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('ykamina:collection-change', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('ykamina:collection-change', refresh); };
  }, []);
  return <Link href="/favorites" aria-label="Избранное" title="Избранное" className="relative grid h-10 w-10 place-items-center rounded-full text-ink transition hover:bg-terracotta/10 hover:text-terracotta">
    <span className="h-5 w-5"><HeartIcon /></span>
    {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-terracotta px-1 text-[9px] font-bold text-white">{count}</span>}
  </Link>;
}
