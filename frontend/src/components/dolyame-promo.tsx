import Image from 'next/image';
import Link from 'next/link';

function DolyameLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 ${compact ? 'p-1' : 'p-2'}`}>
      <Image src="/images/dolyami-logo-black.svg" alt="Долями" width={compact ? 92 : 160} height={compact ? 18 : 31} className={compact ? 'h-auto w-[92px]' : 'h-auto w-40'} />
    </span>
  );
}

export function DolyameInline({ firstPayment }: { firstPayment?: string }) {
  return <span className="inline-flex flex-wrap items-center gap-x-2 text-[11px] text-ink/60"><DolyameLogo compact /><span className="font-medium text-ink/70">Первый платёж — {firstPayment ? `${firstPayment} (25%)` : '25% стоимости'}</span></span>;
}

export function DolyameCardPrice({ firstPayment }: { firstPayment: string }) {
  return <span className="inline-flex shrink-0 flex-col items-start rounded-xl bg-[#f3f9ff] px-2.5 py-2"><Image src="/images/dolyami-logo-black.svg" alt="Долями" width={76} height={15} className="h-auto w-[76px]" /><span className="mt-1 text-[9px] font-medium leading-3 text-ink/60">Предоплата от {firstPayment}</span></span>;
}

export function DolyamePromo() {
  return <section className="overflow-hidden bg-[#f3f9ff]"><div className="container-page grid gap-10 py-16 sm:py-20 lg:grid-cols-[1.15fr_.85fr] lg:items-center"><div><DolyameLogo /><h2 className="mt-5 max-w-2xl font-serif text-4xl leading-[1.02] tracking-[-.045em] sm:text-5xl">Платите сразу только часть, остальное — Долями</h2><p className="mt-4 text-sm font-semibold text-ink">Первый платёж — 25% стоимости</p><p className="mt-5 max-w-xl text-base leading-7 text-ink/65">Выберите камин, а на странице оплаты выберите сервис «Долями» и завершите оформление по защищённой ссылке.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/catalog" className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:bg-terracotta">Выбрать камин</Link><Link href="/delivery" className="rounded-full border border-ink/15 bg-white/60 px-6 py-3 text-sm font-medium text-ink transition hover:border-ink/30">Как оплатить</Link></div></div><div className="aspect-square w-full max-w-md justify-self-center overflow-hidden rounded-3xl shadow-[0_24px_60px_-36px_rgba(29,29,27,.45)] lg:justify-self-end"><Image src="/images/dolyame-fireplace-four-parts-v1.png" alt="Камин, разделённый на четыре равные части" width={1254} height={1254} sizes="(min-width: 1024px) 448px, (min-width: 640px) 448px, calc(100vw - 40px)" className="h-full w-full object-cover" /></div></div><div className="container-page pb-6 text-[9px] leading-4 text-ink/45">Сервис «Долями» предоставляет ООО «Т‑Покупки», ОГРН 1237700231449, ИНН 7743414212, в рамках договора поручения по приобретению и оплате товаров, работ и услуг. Расчёт первого платежа на сайте составляет 25% стоимости товара. Фактические размеры долей, их соотношение и сроки оплаты указываются перед оплатой и в личном кабинете клиента. Подробнее о сервисе на <a href="https://dolyame.ru" target="_blank" rel="noreferrer" className="underline">dolyame.ru</a>. 0+</div></section>;
}
