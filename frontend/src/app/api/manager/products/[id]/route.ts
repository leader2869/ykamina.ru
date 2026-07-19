import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { getAdminPool, getAdminProduct } from '@/lib/admin';

export const dynamic = 'force-dynamic';

async function requireStaff() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 }) };
  if (user.role !== 'sales_manager' && user.role !== 'super_admin') return { error: NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 }) };
  return { user };
}

const optionalNumber = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
};

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const access = await requireStaff();
  if (access.error) return access.error;
  const product = await getAdminProduct(params.id);
  return product ? NextResponse.json({ data: product }) : NextResponse.json({ error: 'Товар не найден' }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const access = await requireStaff();
  if (access.error || !access.user) return access.error!;
  if (!/^\d+$/.test(params.id)) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name || '').trim();
    const sku = String(body.sku || '').trim() || null;
    const description = String(body.description || '').trim();
    const categoryId = String(body.categoryId || '');
    const price = optionalNumber(body.price);
    const oldPrice = optionalNumber(body.oldPrice);
    const stock = optionalNumber(body.stock);
    const weight = optionalNumber(body.weight);
    const width = optionalNumber(body.width);
    const height = optionalNumber(body.height);
    const depth = optionalNumber(body.depth);
    const images = Array.isArray(body.images) ? body.images.map(String).map((item) => item.trim()).filter(Boolean) : [];
    const numbers = [price, oldPrice, stock, weight, width, height, depth].filter((value) => value !== null);
    const invalidImage = images.some((image) => {
      if (image.startsWith('/')) return false;
      try { return !['http:', 'https:'].includes(new URL(image).protocol); } catch { return true; }
    });
    if (name.length < 2) return NextResponse.json({ error: 'Укажите название товара' }, { status: 400 });
    if (!/^\d+$/.test(categoryId)) return NextResponse.json({ error: 'Выберите категорию' }, { status: 400 });
    if (price === null || price < 0 || numbers.some((value) => !Number.isFinite(value) || Number(value) < 0)) return NextResponse.json({ error: 'Проверьте числовые поля' }, { status: 400 });
    if (stock !== null && !Number.isInteger(stock)) return NextResponse.json({ error: 'Остаток должен быть целым числом' }, { status: 400 });
    if (invalidImage) return NextResponse.json({ error: 'Некорректная ссылка на изображение' }, { status: 400 });

    const dimensions = { ...(width !== null && { width }), ...(height !== null && { height }), ...(depth !== null && { depth }) };
    const result = await getAdminPool().query<{ name: string }>(
      `UPDATE products SET name = $1, description = $2, price = $3, old_price = $4,
        category_id = $5, images = $6::jsonb, stock = $7, dimensions = $8::jsonb,
        weight = $9, supplier_sku = $10, updated_at = NOW()
       WHERE id = $11 RETURNING name`,
      [name, description, price, oldPrice, categoryId, JSON.stringify(images), stock ?? 0, JSON.stringify(dimensions), weight, sku, params.id],
    );
    if (!result.rows[0]) return NextResponse.json({ error: 'Товар не найден' }, { status: 404 });
    try {
      await getAdminPool().query(
        `INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, entity_label, metadata)
         VALUES ($1, 'product.updated', 'product', $2, $3, $4::jsonb)`,
        [access.user.id, params.id, result.rows[0].name, JSON.stringify({ categoryId, source: 'sales_manager' })],
      );
    } catch (error) { console.error('Product edit audit failed:', error); }
    revalidatePath('/manager'); revalidatePath('/admin'); revalidatePath('/catalog'); revalidatePath(`/catalog/${params.id}`);
    return NextResponse.json({ data: await getAdminProduct(params.id) });
  } catch (error) {
    console.error('Manager product update failed:', error);
    return NextResponse.json({ error: 'Не удалось сохранить товар' }, { status: 500 });
  }
}
