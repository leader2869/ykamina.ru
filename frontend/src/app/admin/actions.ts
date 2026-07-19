'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser, hashPassword, UserRole } from '@/lib/auth';
import { getAdminPool } from '@/lib/admin';

const adminCatalogUrl = (params: Record<string, string>) => {
  const search = new URLSearchParams({ section: 'catalog', ...params });
  return `/admin?${search.toString()}`;
};

const adminTeamUrl = (params: Record<string, string>) => {
  const search = new URLSearchParams({ section: 'team', ...params });
  return `/admin?${search.toString()}`;
};

const slugify = (value: string) => value
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-zа-яё0-9]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 220);

const optionalNumber = (value: FormDataEntryValue | null) => {
  const text = String(value || '').trim().replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
};

async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect('/account/login?next=/admin');
  if (user.role !== 'super_admin') redirect('/account?access=denied');
  return user;
}

async function writeAudit(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  entityLabel: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await getAdminPool().query(
      `INSERT INTO admin_audit_log
        (actor_user_id, action, entity_type, entity_id, entity_label, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorId, action, entityType, entityId, entityLabel, JSON.stringify(metadata)],
    );
  } catch (error) {
    console.error('Admin audit write failed:', error);
  }
}

export async function toggleProductPublication(formData: FormData) {
  const actor = await requireSuperAdmin();
  const productId = String(formData.get('productId') || '');
  const nextPublished = formData.get('nextPublished') === 'true';
  if (!/^\d+$/.test(productId)) return;

  const result = await getAdminPool().query<{ name: string }>(
    `UPDATE products SET is_published = $1, visibility_comment = $2, updated_at = NOW()
     WHERE id = $3 RETURNING name`,
    [nextPublished, nextPublished ? null : 'Скрыт вручную', productId],
  );
  if (result.rows[0]) {
    await writeAudit(actor.id, nextPublished ? 'product.published' : 'product.unpublished',
      'product', productId, result.rows[0].name);
  }
  revalidatePath('/admin');
  revalidatePath('/catalog');
}

export async function createManualProduct(formData: FormData) {
  const actor = await requireSuperAdmin();
  const name = String(formData.get('name') || '').trim();
  const sku = String(formData.get('sku') || '').trim() || null;
  const description = String(formData.get('description') || '').trim();
  const categoryId = String(formData.get('categoryId') || '');
  const price = optionalNumber(formData.get('price'));
  const oldPrice = optionalNumber(formData.get('oldPrice'));
  const stock = optionalNumber(formData.get('stock'));
  const weight = optionalNumber(formData.get('weight'));
  const width = optionalNumber(formData.get('width'));
  const height = optionalNumber(formData.get('height'));
  const depth = optionalNumber(formData.get('depth'));
  const isPublished = formData.get('isPublished') === 'on';
  const images = String(formData.get('images') || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

  const invalidImage = images.some((image) => {
    if (image.startsWith('/')) return false;
    try { return !['http:', 'https:'].includes(new URL(image).protocol); } catch { return true; }
  });
  const dimensions = { ...(width !== null && { width }), ...(height !== null && { height }), ...(depth !== null && { depth }) };
  const numbers = [price, oldPrice, stock, weight, width, height, depth].filter((value) => value !== null);
  let error = '';
  if (name.length < 2) error = 'Укажите название товара';
  else if (!/^\d+$/.test(categoryId)) error = 'Выберите категорию';
  else if (price === null || price < 0) error = 'Укажите корректную цену';
  else if (numbers.some((value) => !Number.isFinite(value) || Number(value) < 0)) error = 'Числовые поля не могут быть отрицательными';
  else if (stock !== null && !Number.isInteger(stock)) error = 'Остаток должен быть целым числом';
  else if (invalidImage) error = 'Адреса изображений должны начинаться с http://, https:// или /';
  if (error) redirect(adminCatalogUrl({ mode: 'new', error }));

  const pool = getAdminPool();
  try {
    const category = await pool.query<{ name: string }>('SELECT name FROM categories WHERE id = $1 LIMIT 1', [categoryId]);
    if (!category.rows[0]) redirect(adminCatalogUrl({ mode: 'new', error: 'Выбранная категория не найдена' }));

    const baseSlug = slugify(name) || 'product';
    const slugResult = await pool.query<{ slug: string }>(
      `SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM products WHERE slug = $1) THEN $1
        ELSE $1 || '-' || (SELECT COALESCE(MAX(id), 0) + 1 FROM products) END AS slug`,
      [baseSlug],
    );
    const result = await pool.query<{ id: string; name: string }>(
      `INSERT INTO products
        (name, slug, description, price, old_price, category_id, images, stock, dimensions, weight, supplier_sku, is_published, visibility_comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11, $12, $13)
       RETURNING id, name`,
      [name, slugResult.rows[0].slug, description, price, oldPrice, categoryId,
        JSON.stringify(images), stock ?? 0, JSON.stringify(dimensions), weight, sku, isPublished,
        isPublished ? null : 'Скрыт вручную'],
    );
    await writeAudit(actor.id, 'product.created', 'product', String(result.rows[0].id), result.rows[0].name,
      { categoryId, isPublished, source: 'manual' });
  } catch (caught) {
    const dbError = caught as { code?: string };
    const message = dbError.code === '23505'
      ? 'Товар с таким артикулом уже существует'
      : 'Не удалось создать товар. Проверьте данные';
    redirect(adminCatalogUrl({ mode: 'new', error: message }));
  }

  revalidatePath('/admin');
  revalidatePath('/catalog');
  redirect(adminCatalogUrl({ created: '1' }));
}

export async function updateProduct(formData: FormData) {
  const actor = await requireSuperAdmin();
  const productId = String(formData.get('productId') || '');
  const name = String(formData.get('name') || '').trim();
  const sku = String(formData.get('sku') || '').trim() || null;
  const description = String(formData.get('description') || '').trim();
  const categoryId = String(formData.get('categoryId') || '');
  const price = optionalNumber(formData.get('price'));
  const oldPrice = optionalNumber(formData.get('oldPrice'));
  const stock = optionalNumber(formData.get('stock'));
  const weight = optionalNumber(formData.get('weight'));
  const width = optionalNumber(formData.get('width'));
  const height = optionalNumber(formData.get('height'));
  const depth = optionalNumber(formData.get('depth'));
  const isPublished = formData.get('isPublished') === 'on';
  const images = String(formData.get('images') || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  const editUrl = (message: string) => adminCatalogUrl({ mode: 'edit', product: productId, error: message });

  const invalidImage = images.some((image) => {
    if (image.startsWith('/')) return false;
    try { return !['http:', 'https:'].includes(new URL(image).protocol); } catch { return true; }
  });
  const dimensions = { ...(width !== null && { width }), ...(height !== null && { height }), ...(depth !== null && { depth }) };
  const numbers = [price, oldPrice, stock, weight, width, height, depth].filter((value) => value !== null);
  let error = '';
  if (!/^\d+$/.test(productId)) error = 'Товар не найден';
  else if (name.length < 2) error = 'Укажите название товара';
  else if (!/^\d+$/.test(categoryId)) error = 'Выберите категорию';
  else if (price === null || price < 0) error = 'Укажите корректную цену';
  else if (numbers.some((value) => !Number.isFinite(value) || Number(value) < 0)) error = 'Числовые поля не могут быть отрицательными';
  else if (stock !== null && !Number.isInteger(stock)) error = 'Остаток должен быть целым числом';
  else if (invalidImage) error = 'Адреса изображений должны начинаться с http://, https:// или /';
  if (error) redirect(editUrl(error));

  try {
    const result = await getAdminPool().query<{ name: string }>(
      `UPDATE products SET name = $1, description = $2, price = $3, old_price = $4,
        category_id = $5, images = $6::jsonb, stock = $7, dimensions = $8::jsonb,
        weight = $9, supplier_sku = $10, is_published = $11, visibility_comment = $12,
        updated_at = NOW()
       WHERE id = $13 RETURNING name`,
      [name, description, price, oldPrice, categoryId, JSON.stringify(images), stock ?? 0,
        JSON.stringify(dimensions), weight, sku, isPublished,
        isPublished ? null : 'Скрыт вручную', productId],
    );
    if (!result.rows[0]) redirect(editUrl('Товар не найден'));
    await writeAudit(actor.id, 'product.updated', 'product', productId, result.rows[0].name,
      { categoryId, isPublished });
  } catch (caught) {
    const dbError = caught as { code?: string };
    const message = dbError.code === '23505'
      ? 'Товар с таким артикулом уже существует'
      : 'Не удалось сохранить изменения';
    redirect(editUrl(message));
  }

  revalidatePath('/admin');
  revalidatePath('/catalog');
  revalidatePath(`/catalog/${productId}`);
  redirect(adminCatalogUrl({ updated: '1' }));
}

export async function updateUserAccess(formData: FormData) {
  const actor = await requireSuperAdmin();
  const userId = String(formData.get('userId') || '');
  const role = String(formData.get('role') || '') as UserRole;
  const isActive = formData.get('isActive') === 'true';
  const allowedRoles: UserRole[] = ['customer', 'sales_manager', 'super_admin'];
  if (!/^\d+$/.test(userId) || !allowedRoles.includes(role) || userId === actor.id) return;

  const result = await getAdminPool().query<{ full_name: string }>(
    `UPDATE users SET role = $1, is_active = $2, updated_at = NOW()
     WHERE id = $3 RETURNING full_name`,
    [role, isActive, userId],
  );
  if (result.rows[0]) {
    await writeAudit(actor.id, 'user.access_updated', 'user', userId, result.rows[0].full_name,
      { role, isActive });
  }
  revalidatePath('/admin');
}

export async function createUser(formData: FormData) {
  const actor = await requireSuperAdmin();
  const fullName = String(formData.get('fullName') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const role = String(formData.get('role') || '') as UserRole;
  const isActive = formData.get('isActive') !== 'false';
  const allowedRoles: UserRole[] = ['customer', 'sales_manager', 'super_admin'];
  if (fullName.length < 2) redirect(adminTeamUrl({ userError: 'Укажите имя пользователя.' }));
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) redirect(adminTeamUrl({ userError: 'Укажите корректный email.' }));
  if (password.length < 8) redirect(adminTeamUrl({ userError: 'Пароль должен содержать минимум 8 символов.' }));
  if (!allowedRoles.includes(role)) redirect(adminTeamUrl({ userError: 'Выберите роль пользователя.' }));

  let user: { id: string; full_name: string };
  try {
    const result = await getAdminPool().query<{ id: string; full_name: string }>(
      `INSERT INTO users (role, full_name, phone, email, birth_date, delivery_address, password_hash, is_active)
       VALUES ($1, $2, '', $3, DATE '1970-01-01', '', $4, $5)
       RETURNING id, full_name`,
      [role, fullName, email, hashPassword(password), isActive],
    );
    user = result.rows[0];
  } catch (error) {
    if ((error as { code?: string }).code === '23505') redirect(adminTeamUrl({ userError: 'Пользователь с таким email уже существует.' }));
    throw error;
  }
  await writeAudit(actor.id, 'user.created', 'user', user.id, user.full_name, { role, isActive, email });
  revalidatePath('/admin');
  redirect(adminTeamUrl({ userCreated: '1' }));
}

export async function updateUser(formData: FormData) {
  const actor = await requireSuperAdmin();
  const userId = String(formData.get('userId') || '');
  const fullName = String(formData.get('fullName') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const role = String(formData.get('role') || '') as UserRole;
  const isActive = formData.get('isActive') === 'true';
  const allowedRoles: UserRole[] = ['customer', 'sales_manager', 'super_admin'];
  if (!/^\d+$/.test(userId)) redirect(adminTeamUrl({ userError: 'Пользователь не найден.' }));
  if (fullName.length < 2) redirect(adminTeamUrl({ userError: 'Укажите имя пользователя.' }));
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) redirect(adminTeamUrl({ userError: 'Укажите корректный email.' }));
  if (password && password.length < 8) redirect(adminTeamUrl({ userError: 'Новый пароль должен содержать минимум 8 символов.' }));
  const isCurrentUser = userId === actor.id;
  if (!isCurrentUser && !allowedRoles.includes(role)) redirect(adminTeamUrl({ userError: 'Выберите роль пользователя.' }));
  const nextRole = isCurrentUser ? actor.role : role;
  const nextIsActive = isCurrentUser ? true : isActive;

  try {
    const result = await getAdminPool().query<{ full_name: string }>(
      `UPDATE users SET full_name = $1, email = $2, role = $3, is_active = $4,
         password_hash = CASE WHEN $5::text = '' THEN password_hash ELSE $5 END,
         updated_at = NOW()
       WHERE id = $6 RETURNING full_name`,
      [fullName, email, nextRole, nextIsActive, password ? hashPassword(password) : '', userId],
    );
    if (!result.rows[0]) redirect(adminTeamUrl({ userError: 'Пользователь не найден.' }));
    await writeAudit(actor.id, 'user.updated', 'user', userId, result.rows[0].full_name,
      { role: nextRole, isActive: nextIsActive, email, passwordChanged: Boolean(password) });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') redirect(adminTeamUrl({ userError: 'Пользователь с таким email уже существует.' }));
    throw error;
  }
  revalidatePath('/admin');
  redirect(adminTeamUrl({ userUpdated: '1' }));
}

export async function deleteUser(formData: FormData) {
  const actor = await requireSuperAdmin();
  const userId = String(formData.get('userId') || '');
  if (!/^\d+$/.test(userId) || userId === actor.id) redirect(adminTeamUrl({ userError: 'Собственную учётную запись удалить нельзя.' }));
  const result = await getAdminPool().query<{ full_name: string }>(
    'DELETE FROM users WHERE id = $1 RETURNING full_name', [userId],
  );
  if (!result.rows[0]) redirect(adminTeamUrl({ userError: 'Пользователь не найден.' }));
  await writeAudit(actor.id, 'user.deleted', 'user', userId, result.rows[0].full_name);
  revalidatePath('/admin');
  redirect(adminTeamUrl({ userDeleted: '1' }));
}
