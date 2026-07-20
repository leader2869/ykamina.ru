import Link from 'next/link';
import { DolyamePromo } from '@/components/dolyame-promo';
import { PromoCarousel } from '@/components/promo-carousel';
import { SalesCarousel } from '@/components/sales-carousel';
import { getSaleProducts } from '@/lib/catalog-repository';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const saleProducts = await getSaleProducts();

  return <><PromoCarousel /><section className="container-page py-20 sm:py-28"><div className="mb-10 flex items-end justify-between gap-4"><div><p className="eyebrow">Выгодные предложения</p><h2 className="mt-3 font-serif text-4xl tracking-[-.04em] sm:text-5xl">Камины по доступным ценам</h2></div><Link href="/sales" className="hidden text-sm font-medium text-terracotta hover:underline sm:block">Все акции →</Link></div>{saleProducts.length ? <SalesCarousel products={saleProducts} /> : <p className="rounded-xl border border-[#e9e5df] bg-porcelain p-6 text-sm text-ink/65">Скоро здесь появятся новые выгодные предложения.</p>}<Link href="/sales" className="button-secondary mt-8 w-full sm:hidden">Все акции</Link></section><DolyamePromo /><section id="about" className="bg-porcelain"><div className="container-page grid gap-10 py-20 sm:py-28 md:grid-cols-[.9fr_1.1fr] md:items-end"><div><p className="eyebrow">У камина</p><h2 className="mt-3 max-w-md font-serif text-5xl leading-[1.02] tracking-[-.05em] sm:text-6xl">Место, куда хочется возвращаться</h2></div><div><p className="max-w-xl text-lg leading-8 text-ink/70">Помогаем выбрать камин, вокруг которого будет собираться семья. Берём на себя подбор, доставку и монтаж.</p><Link href="/catalog" className="mt-7 inline-flex text-sm font-semibold text-terracotta hover:underline">Найти свой камин →</Link></div></div></section><section id="delivery" className="container-page grid gap-8 py-20 sm:grid-cols-3 sm:py-24">{[['01', 'Поможем выбрать', 'Спокойно разберёмся в моделях и найдём камин, подходящий именно вашему дому.'], ['02', 'Доставим бережно', 'Аккуратно привезём покупку по Москве или в любой регион России.'], ['03', 'Установим безопасно', 'Подскажем по монтажу и поможем сделать первый огонь по-настоящему домашним.']].map(([number, title, text]) => <div key={number} className="border-t border-ink/30 pt-5"><p className="text-xs font-semibold tracking-[.16em] text-terracotta">{number}</p><h3 className="mt-4 font-serif text-3xl tracking-[-.03em]">{title}</h3><p className="mt-3 max-w-xs text-ink/65">{text}</p></div>)}</section></>;
}
