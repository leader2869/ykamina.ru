'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

type CategoryChild = { slug: string; href: string; label: string };
type CategoryMenu = { href: string; title: string; example: string; children: CategoryChild[] };
type Preview = { images: string[] };

export function CategoryDropdown({ type, previews }: { type: CategoryMenu; previews: Record<string, Preview> }) {
  const [activeSlug, setActiveSlug] = useState(type.children[0]?.slug);
  const [imageIndex, setImageIndex] = useState(0);
  const preview = activeSlug ? previews[activeSlug] : undefined;
  const chooseImage = (slug: string) => {
    setActiveSlug(slug);
    const images = previews[slug]?.images || [];
    setImageIndex(images.length ? Math.floor(Math.random() * images.length) : 0);
  };
  const image = preview?.images[imageIndex % (preview?.images.length || 1)];
  return <div onMouseEnter={() => activeSlug && chooseImage(activeSlug)} className="group relative py-7"><Link href={type.href} className="flex items-center gap-1.5 transition hover:text-terracotta">{type.title}<span className="text-[10px] transition group-hover:rotate-180">⌄</span></Link><div className="pointer-events-none absolute left-1/2 top-full z-50 grid w-[520px] -translate-x-1/2 translate-y-2 grid-cols-[190px_1fr] gap-4 rounded-2xl border border-[#e9e5df] bg-white p-4 opacity-0 shadow-[0_20px_50px_-25px_rgba(29,29,27,.35)] transition duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100"><Link href={activeSlug ? type.children.find((child) => child.slug === activeSlug)?.href || type.href : type.href} className="group/card relative min-h-56 overflow-hidden rounded-xl bg-white">{image ? <Image src={image} alt={type.title} fill className="object-contain p-3 transition duration-300 group-hover/card:scale-105" sizes="190px" /> : <span className="flex h-full items-end p-4 font-serif text-xl text-ink">{type.title}</span>}</Link><div><Link href={type.href} className="block font-serif text-2xl text-ink transition hover:text-terracotta">{type.title}</Link><p className="mt-1 text-xs leading-5 text-ink/60">{type.example}</p><div className="mt-3 border-t border-[#e9e5df] pt-2">{type.children.map((child) => <Link onMouseEnter={() => chooseImage(child.slug)} onFocus={() => chooseImage(child.slug)} key={child.href} href={child.href} className="block rounded-lg px-3 py-2 text-sm transition hover:bg-porcelain hover:text-terracotta">{child.label}</Link>)}</div></div></div></div>;
}
