'use client';

import { useRouter } from 'next/navigation';

export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const router = useRouter();
  return <button type="button" onClick={() => window.history.length > 1 ? router.back() : router.push(fallback)} className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 transition hover:border-terracotta hover:text-terracotta"><span aria-hidden="true">←</span>Назад</button>;
}
