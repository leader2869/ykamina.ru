'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser, UserRole } from '@/lib/auth';
import { getAdminPool } from '@/lib/admin';

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
    'UPDATE products SET is_published = $1, updated_at = NOW() WHERE id = $2 RETURNING name',
    [nextPublished, productId],
  );
  if (result.rows[0]) {
    await writeAudit(actor.id, nextPublished ? 'product.published' : 'product.unpublished',
      'product', productId, result.rows[0].name);
  }
  revalidatePath('/admin');
  revalidatePath('/catalog');
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
