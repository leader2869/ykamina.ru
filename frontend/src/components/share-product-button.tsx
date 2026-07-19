'use client';

import { useState } from 'react';

async function copyLink(url: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const input = document.createElement('textarea');
  input.value = url;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export function ShareProductButton({ productId, productName }: { productId: string; productName: string }) {
  const [copied, setCopied] = useState(false);

  async function shareProduct() {
    const url = `${window.location.origin}/catalog/${productId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: productName, url });
        return;
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return;
      }
    }
    await copyLink(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <button type="button" onClick={shareProduct} aria-label={copied ? 'Ссылка скопирована' : 'Поделиться товаром'} title={copied ? 'Ссылка скопирована' : 'Поделиться'} className={`grid h-8 w-8 place-items-center rounded-full border text-sm transition ${copied ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-ink/15 hover:border-terracotta hover:text-terracotta'}`}>
    {copied ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" /></svg>}
  </button>;
}
