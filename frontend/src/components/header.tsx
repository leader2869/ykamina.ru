import Link from 'next/link';

const links = [{ href: '/catalog', label: 'Каталог' }, { href: '/#about', label: 'О компании' }, { href: '/#delivery', label: 'Доставка' }];

export function Header() {
  return <header className="border-b border-ink/10 bg-white/95 backdrop-blur">
    <div className="container-page flex h-20 items-center justify-between gap-6">
      <Link href="/" className="font-serif text-2xl font-semibold tracking-tight text-ink">YKAMINA<span className="text-terracotta">.</span></Link>
      <nav className="hidden items-center gap-7 text-sm text-ink/75 md:flex">{links.map((link) => <Link className="transition hover:text-terracotta" key={link.href} href={link.href}>{link.label}</Link>)}</nav>
      <div className="flex items-center gap-4 text-sm font-medium"><a className="hidden lg:block" href="tel:+74951234567">+7 (495) 123-45-67</a><Link href="/cart" className="rounded-full border border-ink/20 px-4 py-2 transition hover:border-terracotta hover:text-terracotta">Корзина <span className="ml-1 rounded-full bg-ink px-1.5 py-0.5 text-xs text-white">0</span></Link></div>
    </div>
  </header>;
}
