'use client';

import Image from 'next/image';
import { useState } from 'react';

export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(0);
  return <div><div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-sand"><Image src={images[active]} alt={name} fill className="object-cover" priority sizes="(max-width: 1024px) 100vw, 50vw" /></div>{images.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{images.map((image, index) => <button onClick={() => setActive(index)} key={image} aria-label={`Фото ${index + 1}`} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${active === index ? 'border-terracotta' : 'border-transparent'}`}><Image src={image} alt="" fill className="object-cover" sizes="64px" /></button>)}</div>}</div>;
}
