import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ManagerDashboard } from '@/components/manager-dashboard';
import { getAdminDashboard } from '@/lib/admin';
import { getCurrentUser } from '@/lib/auth';
import { getPaymentOrders, getSalesAnalytics } from '@/lib/payment-orders';

export const metadata: Metadata = {
  title: 'Рабочий стол менеджера — Ykamina.ru',
  description: 'Сделки, задачи и клиенты отдела продаж Ykamina.ru.',
};

export default async function ManagerPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/account/login?next=/manager');
  if (user.role === 'super_admin') redirect('/admin');
  if (user.role !== 'sales_manager') redirect('/account?access=denied');

  const [data, orders, analytics] = await Promise.all([
    getAdminDashboard(), getPaymentOrders(250), getSalesAnalytics(user.id),
  ]);
  return <ManagerDashboard
    user={{ fullName: user.fullName }}
    catalog={{
      databaseConnected: data.databaseConnected,
      metrics: { products: data.metrics.products, published: data.metrics.published },
      products: data.products,
      categories: data.categories,
    }}
    orders={orders}
    analytics={analytics}
  />;
}
