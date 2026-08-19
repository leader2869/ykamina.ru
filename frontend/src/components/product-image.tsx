'use client';

import Image, { ImageProps } from 'next/image';
import { useEffect, useState } from 'react';

type ProductImageProps = Omit<ImageProps, 'src'> & { src: string; compact?: boolean };

export function ProductImage({ src, alt, compact = false, ...props }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (failed) {
    return <div role="img" aria-label={alt} className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#f7f3ed] text-[#9a8f83]">
      <svg aria-hidden="true" viewBox="0 0 64 64" className={compact ? 'h-7 w-7' : 'h-12 w-12'} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M13 52h38M17 52V18h30v34M22 18V12h20v6M23 45V29h18v16M27 41c0-5 5-6 5-11 4 4 7 7 5 11-2 4-8 5-10 0Z" />
      </svg>
      {!compact && <span className="text-[11px] font-medium uppercase tracking-[.12em]">Фото обновляется</span>}
    </div>;
  }

  return <Image src={src} alt={alt} {...props} onError={() => setFailed(true)} />;
}
