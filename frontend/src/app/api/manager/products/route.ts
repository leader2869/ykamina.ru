import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAdminPool, getAdminProduct } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const optionalNumber = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
};

const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 220);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
  if (user.role !== 'sales_manager' && user.role !== 'super_admin')
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
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
    const images = Array.isArray(body.images)
      ? body.images.map(String).map((item) => item.trim()).filter(Boolean)
      : [];
    const numbers = [price, oldPrice, stock, weight, width, height, depth].filter(
      (value) => value !== null,
    );
    const invalidImage = images.some((image) => {
      if (image.startsWith('/')) return false;
      try {
        return !['http:', 'https:'].includes(new URL(image).protocol);
      } catch {
        return true;
      }
    });
    if (name.length < 2)
      return NextResponse.json({ error: 'Укажите название товара' }, { status: 400 });
    if (!/^\d+$/.test(categoryId))
      return NextResponse.json({ error: 'Выберите категорию' }, { status: 400 });
    if (
      price === null ||
      price < 0 ||
      numbers.some((value) => !Number.isFinite(value) || Number(value) < 0)
    )
      return NextResponse.json({ error: 'Проверьте числовые поля' }, { status: 400 });
    if (stock !== null && !Number.isInteger(stock))
      return NextResponse.json({ error: 'Остаток должен быть целым числом' }, { status: 400 });
    if (invalidImage)
      return NextResponse.json({ error: 'Некорректная ссылка на изображение' }, { status: 400 });

    const pool = getAdminPool();
    const category = await pool.query('SELECT id FROM categories WHERE id = $1 LIMIT 1', [
      categoryId,
    ]);
    if (!category.rows[0])
      return NextResponse.json({ error: 'Выбранная категория не найдена' }, { status: 400 });

    const baseSlug = slugify(name) || 'product';
    const dimensions = {
      ...(width !== null && { width }),
      ...(height !== null && { height }),
      ...(depth !== null && { depth }),
    };
    const client = await pool.connect();
    let result: { id: string; name: string };
    try {
      await client.query('BEGIN');
      const slugResult = await client.query<{ slug: string }>(
        `SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM products WHERE slug = $1) THEN $1
          ELSE $1 || '-' || (SELECT COALESCE(MAX(id), 0) + 1 FROM products) END AS slug`,
        [baseSlug],
      );
      const productResult = await client.query<{ id: string; name: string }>(
        `INSERT INTO products
          (name, slug, description, price, old_price, category_id, images, stock, dimensions, weight,
           supplier_sku, is_published, visibility_comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11, FALSE,
           'Добавлен менеджером, ожидает публикации')
         RETURNING id, name`,
        [
          name,
          slugResult.rows[0].slug,
          description,
          price,
          oldPrice,
          categoryId,
          JSON.stringify(images),
          stock ?? 0,
          JSON.stringify(dimensions),
          weight,
          sku,
        ],
      );
      result = productResult.rows[0];
      await client.query(
        `INSERT INTO admin_audit_log
          (actor_user_id, action, entity_type, entity_id, entity_label, metadata)
         VALUES ($1, 'product.created', 'product', $2, $3, $4::jsonb)`,
        [
          user.id,
          result.id,
          result.name,
          JSON.stringify({ categoryId, isPublished: false, source: user.role }),
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    revalidatePath('/manager');
    revalidatePath('/admin');
    revalidatePath('/catalog');
    return NextResponse.json({ data: await getAdminProduct(result.id) });
  } catch (error) {
    const databaseError = error as { code?: string };
    console.error('Manager product create failed:', error);
    return NextResponse.json(
      {
        error:
          databaseError.code === '23505'
            ? 'Товар с таким артикулом уже существует'
            : 'Не удалось создать товар',
      },
      { status: 500 },
    );
  }
}
