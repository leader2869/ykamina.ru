import Image from 'next/image';
import Link from 'next/link';

function DolyameLogo({ compact = false }: { compact?: boolean }) {
  return <span className={`inline-flex shrink-0 ${compact ? 'p-1' : 'p-2'}`}>
    <Image
      src="/images/dolyami-logo-black.svg"
      alt="Долями"
      width={compact ? 92 : 160}
      height={compact ? 18 : 31}
      className={compact ? 'h-auto w-[92px]' : 'h-auto w-40'}
    />
  </span>;
}

export function DolyameInline({ firstPayment }: { firstPayment?: string }) {
  return <span className="inline-flex flex-wrap items-center gap-x-2 text-[11px] text-ink/60">
    <DolyameLogo compact />
    <span className="font-medium text-ink/70">Первый платёж — {firstPayment ? `${firstPayment} (25%)` : '25% стоимости'}</span>
  </span>;
}

export function DolyamePromo() {
  return <section className="overflow-hidden bg-[#f3f9ff]">
    <div className="container-page grid gap-10 py-16 sm:py-20 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
      <div>
        <DolyameLogo />
        <h2 className="mt-5 max-w-2xl font-serif text-4xl leading-[1.02] tracking-[-.045em] sm:text-5xl">
          Платите сразу только часть, остальное — Долями
        </h2>
        <p className="mt-4 text-sm font-semibold text-ink">Первый платёж — 25% стоимости</p>
        <p className="mt-5 max-w-xl text-base leading-7 text-ink/65">
          Выберите камин, сообщите менеджеру, что хотите оплатить Долями, и завершите оплату по защищённой ссылке сервиса.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/catalog" className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:bg-terracotta">Выбрать камин</Link>
          <Link href="/delivery" className="rounded-full border border-ink/15 bg-white/60 px-6 py-3 text-sm font-medium text-ink transition hover:border-ink/30">Как оплатить</Link>
        </div>
      </div>
      <div aria-hidden="true" className="flex aspect-square w-full max-w-md items-end gap-2 justify-self-center rounded-3xl bg-white p-8 lg:justify-self-end">
        <span className="h-[70%] flex-1 bg-[#b3eaff]" />
        <span className="h-[80%] flex-1 bg-[#b3eaff]" />
        <span className="h-[90%] flex-1 bg-[#b3eaff]" />
        <span className="h-full flex-1 bg-[#b3eaff]" />
      </div>
    </div>
    <div className="container-page pb-6 text-[9px] leading-4 text-ink/45">
      Сервис «Долями» предоставляет ООО «Т‑Покупки», ОГРН 1237700231449, ИНН 7743414212, в рамках договора поручения по приобретению и оплате товаров, работ и услуг. Расчёт первого платежа на сайте составляет 25% стоимости товара. Фактические размеры долей, их соотношение и сроки оплаты указываются перед оплатой и в личном кабинете клиента. Подробнее о сервисе на <a href="https://dolyame.ru" target="_blank" rel="noreferrer" className="underline">dolyame.ru</a>. 0+
    </div>
  </section>;
}
