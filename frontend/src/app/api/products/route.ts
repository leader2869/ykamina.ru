import { NextResponse } from 'next/server';
import { getProducts } from '@/lib/catalog-repository';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) { const category = new URL(request.url).searchParams.get('category') || undefined; const products = await getProducts(category); return NextResponse.json({ data: products, total: products.length }); }
