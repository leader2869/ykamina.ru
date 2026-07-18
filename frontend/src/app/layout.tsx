import type { Metadata } from 'next';
import { Playfair_Display } from 'next/font/google';
import './globals.css';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';

const playfair = Playfair_Display({ subsets: ['cyrillic'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = { title: 'Ykamina.ru — У камина', description: 'Камины для тёплого и уютного дома.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ru"><body className={`${playfair.variable} font-sans`}><Header /><main>{children}</main><Footer /></body></html>; }
