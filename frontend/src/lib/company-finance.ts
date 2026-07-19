import { Pool } from 'pg';
import { getDatabaseConnectionString } from '@/lib/database';

const globalForFinance = global as typeof globalThis & { companyFinancePool?: Pool };
const connectionString = getDatabaseConnectionString();
const pool = connectionString
  ? (globalForFinance.companyFinancePool ??= new Pool({ connectionString, max: 2, idleTimeoutMillis: 10_000 }))
  : null;

export const financeCategoryNames: Record<string, string> = {
  taxes: 'Налоги',
  payroll: 'Зарплаты',
  rent: 'Аренда',
  acquiring: 'Эквайринг',
  advertising: 'Реклама',
  subscriptions: 'Подписки и сервисы',
  logistics: 'Логистика',
  utilities: 'Коммунальные расходы',
  services: 'Услуги подрядчиков',
  other: 'Прочее',
};

export type CompanyExpense = {
  id: string;
  name: string;
  category: string;
  calculationType: 'fixed' | 'revenue_percent';
  amountKopecks: number | null;
  revenuePercent: number | null;
  recurrence: 'recurring' | 'one_time';
  startMonth: string;
  endMonth: string | null;
  notes: string | null;
  calculatedAmountKopecks: number;
};

export type CompanyFinanceMonth = {
  month: string;
  paidOrders: number;
  revenueKopecks: number;
  purchaseCostKopecks: number;
  grossProfitKopecks: number;
  operatingExpensesKopecks: number;
  netProfitKopecks: number;
  profitabilityPercent: number;
  paidOrdersMissingCost: number;
};

export type CompanyFinance = {
  databaseReady: boolean;
  selectedMonth: string;
  summary: CompanyFinanceMonth;
  expenses: CompanyExpense[];
  trend: CompanyFinanceMonth[];
};

type ExpenseRow = {
  id: string;
  name: string;
  category: string;
  calculation_type: 'fixed' | 'revenue_percent';
  amount_kopecks: string | null;
  revenue_percent: string | null;
  recurrence: 'recurring' | 'one_time';
  start_month: Date;
  end_month: Date | null;
  notes: string | null;
};

const normalizeMonth = (value?: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '')
  ? value!
  : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit' });

const monthKey = (value: Date) => value.toISOString().slice(0, 7);

function expenseApplies(expense: ExpenseRow, month: string) {
  const start = monthKey(expense.start_month);
  const end = expense.end_month ? monthKey(expense.end_month) : null;
  if (expense.recurrence === 'one_time') return start === month;
  return start <= month && (!end || end >= month);
}

function expenseAmount(expense: ExpenseRow, revenueKopecks: number) {
  if (expense.calculation_type === 'revenue_percent') {
    return Math.round(revenueKopecks * Number(expense.revenue_percent || 0) / 100);
  }
  return Number(expense.amount_kopecks || 0);
}

function emptyMonth(month: string): CompanyFinanceMonth {
  return { month, paidOrders: 0, revenueKopecks: 0, purchaseCostKopecks: 0, grossProfitKopecks: 0, operatingExpensesKopecks: 0, netProfitKopecks: 0, profitabilityPercent: 0, paidOrdersMissingCost: 0 };
}

export async function getCompanyFinance(requestedMonth?: string): Promise<CompanyFinance> {
  const selectedMonth = normalizeMonth(requestedMonth);
  if (!pool) return { databaseReady: false, selectedMonth, summary: emptyMonth(selectedMonth), expenses: [], trend: [] };

  const table = await pool.query<{ ready: boolean }>(`SELECT to_regclass('public.company_expenses') IS NOT NULL AS ready`);
  if (!table.rows[0]?.ready) return { databaseReady: false, selectedMonth, summary: emptyMonth(selectedMonth), expenses: [], trend: [] };

  const selectedDate = `${selectedMonth}-01`;
  const [salesResult, expensesResult] = await Promise.all([
    pool.query<{
      month: Date;
      paid_orders: string;
      revenue: string;
      purchase_cost: string;
      missing_cost: string;
    }>(
      `WITH months AS (
        SELECT generate_series(($1::date - INTERVAL '5 months')::date, $1::date, INTERVAL '1 month')::date AS month
      ), financial_orders AS (
        SELECT o.id, o.amount_kopecks, COALESCE(o.paid_at, o.created_at) AS paid_date,
          CASE WHEN NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(o.items) item
            WHERE NOT (item ? 'purchaseCostKopecks') OR COALESCE((item->>'purchaseCostKopecks')::bigint, 0) <= 0
          ) THEN (
            SELECT COALESCE(SUM((item->>'purchaseCostKopecks')::bigint * (item->>'quantity')::integer), 0)
            FROM jsonb_array_elements(o.items) item
          ) ELSE NULL END AS purchase_cost
        FROM payment_orders o
        WHERE o.status = 'confirmed'
          AND COALESCE(o.paid_at, o.created_at) >= $1::date - INTERVAL '5 months'
          AND COALESCE(o.paid_at, o.created_at) < $1::date + INTERVAL '1 month'
      )
      SELECT m.month, COUNT(o.id) AS paid_orders,
        COALESCE(SUM(o.amount_kopecks), 0) AS revenue,
        COALESCE(SUM(o.purchase_cost) FILTER (WHERE o.purchase_cost IS NOT NULL), 0) AS purchase_cost,
        COUNT(o.id) FILTER (WHERE o.purchase_cost IS NULL) AS missing_cost
      FROM months m
      LEFT JOIN financial_orders o ON DATE_TRUNC('month', o.paid_date) = m.month
      GROUP BY m.month ORDER BY m.month`,
      [selectedDate],
    ),
    pool.query<ExpenseRow>(
      `SELECT id,name,category,calculation_type,amount_kopecks,revenue_percent,recurrence,
        start_month,end_month,notes
       FROM company_expenses
       WHERE start_month <= $1::date
         AND (end_month IS NULL OR end_month >= $1::date - INTERVAL '5 months')
       ORDER BY category,name`,
      [selectedDate],
    ),
  ]);

  const trend = salesResult.rows.map((row) => {
    const month = monthKey(row.month);
    const revenueKopecks = Number(row.revenue);
    const purchaseCostKopecks = Number(row.purchase_cost);
    const operatingExpensesKopecks = expensesResult.rows
      .filter((expense) => expenseApplies(expense, month))
      .reduce((sum, expense) => sum + expenseAmount(expense, revenueKopecks), 0);
    const grossProfitKopecks = revenueKopecks - purchaseCostKopecks;
    const netProfitKopecks = grossProfitKopecks - operatingExpensesKopecks;
    return {
      month,
      paidOrders: Number(row.paid_orders),
      revenueKopecks,
      purchaseCostKopecks,
      grossProfitKopecks,
      operatingExpensesKopecks,
      netProfitKopecks,
      profitabilityPercent: revenueKopecks ? Math.round(netProfitKopecks / revenueKopecks * 1000) / 10 : 0,
      paidOrdersMissingCost: Number(row.missing_cost),
    };
  });
  const summary = trend.find((item) => item.month === selectedMonth) || emptyMonth(selectedMonth);
  const currentExpenses = expensesResult.rows
    .filter((expense) => expenseApplies(expense, selectedMonth))
    .map<CompanyExpense>((expense) => ({
      id: String(expense.id),
      name: expense.name,
      category: expense.category,
      calculationType: expense.calculation_type,
      amountKopecks: expense.amount_kopecks === null ? null : Number(expense.amount_kopecks),
      revenuePercent: expense.revenue_percent === null ? null : Number(expense.revenue_percent),
      recurrence: expense.recurrence,
      startMonth: monthKey(expense.start_month),
      endMonth: expense.end_month ? monthKey(expense.end_month) : null,
      notes: expense.notes,
      calculatedAmountKopecks: expenseAmount(expense, summary.revenueKopecks),
    }));

  return { databaseReady: true, selectedMonth, summary, expenses: currentExpenses, trend };
}

export function getCompanyFinancePool() {
  if (!pool) throw new Error('Финансовый учёт не подключён к базе данных');
  return pool;
}
