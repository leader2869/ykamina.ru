import Link from 'next/link';
import { BuyersMenu } from '@/components/buyers-menu';
import { CategoryDropdown } from '@/components/category-dropdown';
import { SavedCollections } from '@/components/saved-collections';
import { getHeaderCategoryPreviews } from '@/lib/catalog-repository';

const quickTypes = [
  { slug: 'электрокамины', href: '/catalog?category=электрокамины', title: 'Электрокамины', example: 'Готовое решение с очагом и порталом', children: [{ slug: 'электрокамины-классические', href: '/catalog?category=электрокамины-классические', label: 'Классические' }, { slug: 'электрокамины-лофт', href: '/catalog?category=электрокамины-лофт', label: 'Лофт' }, { slug: 'электрокамины-модерн', href: '/catalog?category=электрокамины-модерн', label: 'Модерн' }, { slug: 'электрокамины-скандинавский-стиль', href: '/catalog?category=электрокамины-скандинавский-стиль', label: 'Скандинавский стиль' }] },
  { slug: 'электроочаги', href: '/catalog?category=электроочаги', title: 'Электроочаги', example: 'Для встраивания в стену или портал', children: [{ slug: 'электроочаги-3d-электроочаги', href: '/catalog?category=электроочаги-3d-электроочаги', label: '3D электроочаги' }, { slug: 'электроочаги-классические', href: '/catalog?category=электроочаги-классические', label: 'Классические' }, { slug: 'электроочаги-линейные', href: '/catalog?category=электроочаги-линейные', label: 'Линейные' }] },
  { slug: 'порталы', href: '/catalog?category=порталы', title: 'Порталы', example: 'Чтобы создать законченный каминный ансамбль', children: [{ slug: 'порталы-стандартные', href: '/catalog?category=порталы-стандартные', label: 'Стандартные' }, { slug: 'порталы-линейные', href: '/catalog?category=порталы-линейные', label: 'Линейные' }, { slug: 'порталы-стандартные-из-камня', href: '/catalog?category=порталы-стандартные-из-камня', label: 'Из камня' }] },
  { slug: 'биокамины', href: '/catalog?category=биокамины', title: 'Биокамины', example: 'Настоящее пламя без дымохода', children: [{ slug: 'биокамины-биокамины', href: '/catalog?category=биокамины', label: 'Биокамины' }] },
];

function CartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6" /><circle cx="9.5" cy="19.5" r="1" /><circle cx="17.5" cy="19.5" r="1" /></svg>;
}

function AccountIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>;
}

export async function Header() {
  const previews = await getHeaderCategoryPreviews();
  return <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/95 backdrop-blur-md">
    <div className="container-page flex h-[72px] items-center justify-between gap-6">
      <Link href="/" className="flex flex-col leading-none"><span className="font-serif text-[26px] font-semibold tracking-[-.05em] text-ink">Ykamina<span className="text-terracotta">.ru</span></span><span className="mt-1.5 text-[8px] font-semibold uppercase tracking-[.14em] text-ink/55 sm:text-[9px]">Уют начинается дома</span></Link>
      <nav className="hidden items-center gap-7 text-[13px] font-medium text-ink/75 lg:flex">
        {quickTypes.map((type) => <CategoryDropdown key={type.href} type={type} previews={previews} />)}
        <Link href="/sales" className="flex items-center gap-1.5 transition hover:text-terracotta"><span className="grid h-5 w-5 place-items-center rounded-full bg-terracotta/10 text-[13px] leading-none text-terracotta">✦</span>Акции</Link>
        <BuyersMenu />
      </nav>
      <div className="flex items-center gap-1 text-sm font-medium"><SavedCollections /><Link href="/cart" aria-label="Корзина" title="Корзина" className="relative grid h-10 w-10 place-items-center rounded-full text-ink transition hover:bg-terracotta/10 hover:text-terracotta"><span className="h-5 w-5"><CartIcon /></span><span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[9px] font-bold text-white">0</span></Link><Link href="/account" aria-label="Личный кабинет" title="Личный кабинет" className="grid h-10 w-10 place-items-center rounded-full text-ink transition hover:bg-terracotta/10 hover:text-terracotta"><span className="h-5 w-5"><AccountIcon /></span></Link><a className="ml-2 hidden whitespace-nowrap text-[13px] transition hover:text-terracotta lg:block" href="tel:+74951234567">+7 (495) 123-45-67</a></div>
    </div>
  </header>;
}
