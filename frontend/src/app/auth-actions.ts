'use server';

import { redirect } from 'next/navigation';
import { destroyCurrentSession } from '@/lib/auth';

export async function logout() {
  await destroyCurrentSession();
  redirect('/account/login');
}
