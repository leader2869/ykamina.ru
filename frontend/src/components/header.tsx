import Link from 'next/link';
import { BuyersMenu } from '@/components/buyers-menu';
import { CategoryDropdown } from '@/components/category-dropdown';
import { getHeaderCategoryPreviews } from '@/lib/catalog-repository';

const quickTypes = [
  { slug: 'электрокамины', href: '/catalog?category=электрокамины', title: 'Электрокамины', example: 'Готовое решение с очагом и порталом', children: [{ slug: 'электрокамины-классические', href: '/catalog?category=электрокамины-классические', label: 'Классические' }, { slug: 'электрокамины-лофт', href: '/catalog?category=электрокамины-лофт', label: 'Лофт' }, { slug: 'электрокамины-модерн', href: '/catalog?category=электрокамины-модерн', label: 'Модерн' }, { slug: 'электрокамины-скандинавский-стиль', href: '/catalog?category=электрокамины-скандинавский-стиль', label: 'Скандинавский стиль' }] },
  { slug: 'электроочаги', href: '/catalog?category=электроочаги', title: 'Электроочаги', example: 'Для встраивания в стену или портал', children: [{ slug: 'электроочаги-3d-электроочаги', href: '/catalog?category=электроочаги-3d-электроочаги', label: '3D электроочаги' }, { slug: 'электроочаги-классические', href: '/catalog?category=электроочаги-классические', label: 'Классические' }, { slug: 'электроочаги-линейные', href: '/catalog?category=электроочаги-линейные', label: 'Линейные' }] },
  { slug: 'порталы', href: '/catalog?category=порталы', title: 'Порталы', example: 'Чтобы создать законченный каминный ансамбль', children: [{ slug: 'порталы-стандартные', href: '/catalog?category=порталы-стандартные', label: 'Стандартные' }, { slug: 'порталы-линейные', href: '/catalog?category=порталы-линейные', label: 'Линейные' }, { slug: 'порталы-стандартные-из-камня', href: '/catalog?category=порталы-стандартные-из-камня', label: 'Из камня' }] },
  { slug: 'биокамины', href: '/catalog?category=биокамины', title: 'Биокамины', example: 'Настоящее пламя без дымохода', children: [{ slug: 'биокамины-биокамины', href: '/catalog?category=биокамины', label: 'Биокамины' }] },
];

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
      <div className="flex items-center gap-3 text-sm font-medium"><a className="hidden text-[13px] lg:block" href="tel:+74951234567">+7 (495) 123-45-67</a><Link href="/cart" className="rounded-full border border-ink/20 px-4 py-2 text-[13px] transition hover:border-terracotta hover:text-terracotta">Корзина <span className="ml-1 rounded-full bg-ink px-1.5 py-0.5 text-[10px] text-white">0</span></Link></div>
    </div>
  </header>;
}
