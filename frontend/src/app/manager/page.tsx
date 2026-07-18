import type { Metadata } from 'next';
import { ManagerDashboard } from '@/components/manager-dashboard';

export const metadata: Metadata = {
  title: 'Рабочий стол менеджера — Ykamina.ru',
  description: 'Сделки, задачи и клиенты отдела продаж Ykamina.ru.',
};

export default function ManagerPage() {
  return <ManagerDashboard />;
}
