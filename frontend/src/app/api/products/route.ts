import { NextResponse } from 'next/server';
import { CatalogQuery, getCatalogPage, getProductsByIds } from '@/lib/catalog-repository';

export const dynamic = 'force-dynamic';

const dimension = (value: string | null): CatalogQuery['width'] => value === 'compact' || value === 'medium' || value === 'large' ? value : undefined;
const positiveNumber = (value: string | null) => value && Number(value) > 0 ? Number(value) : undefined;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ids = params.get('ids')?.split(',').map((id) => id.trim()).filter(Boolean);
  if (ids?.length) {
    const products = await getProductsByIds(ids);
    return NextResponse.json({ data: products, total: products.length }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  }
  const sort = params.get('sort');
  const query: CatalogQuery = {
    category: params.get('category') || undefined,
    types: params.getAll('type').filter(Boolean),
    minPrice: positiveNumber(params.get('minPrice')),
    maxPrice: positiveNumber(params.get('maxPrice')),
    width: dimension(params.get('width')),
    height: dimension(params.get('height')),
    sort: sort === 'low' || sort === 'high' ? sort : 'popular',
    page: positiveNumber(params.get('page')),
    pageSize: positiveNumber(params.get('pageSize')),
  };
  const result = await getCatalogPage(query, params.get('facets') === '1');
  return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } });
}
