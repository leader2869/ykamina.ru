import type { Metadata } from 'next';
import './globals.css';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';

export const metadata: Metadata = { title: 'YKAMINA — камины для дома', description: 'Премиальные камины, топки и очаги.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ru"><body className="font-sans"><Header /><main>{children}</main><Footer /></body></html>; }
