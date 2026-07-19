CREATE TABLE IF NOT EXISTS company_expenses (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(32) NOT NULL,
  calculation_type VARCHAR(24) NOT NULL DEFAULT 'fixed',
  amount_kopecks BIGINT,
  revenue_percent NUMERIC(7, 3),
  recurrence VARCHAR(24) NOT NULL DEFAULT 'one_time',
  start_month DATE NOT NULL,
  end_month DATE,
  notes TEXT,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (category IN ('taxes', 'payroll', 'rent', 'acquiring', 'advertising', 'subscriptions', 'logistics', 'utilities', 'services', 'other')),
  CHECK (calculation_type IN ('fixed', 'revenue_percent')),
  CHECK (recurrence IN ('recurring', 'one_time')),
  CHECK (amount_kopecks IS NULL OR amount_kopecks >= 0),
  CHECK (revenue_percent IS NULL OR revenue_percent BETWEEN 0 AND 100),
  CHECK (
    (calculation_type = 'fixed' AND amount_kopecks IS NOT NULL AND revenue_percent IS NULL)
    OR
    (calculation_type = 'revenue_percent' AND revenue_percent IS NOT NULL AND amount_kopecks IS NULL)
  ),
  CHECK (end_month IS NULL OR end_month >= start_month)
);

CREATE INDEX IF NOT EXISTS company_expenses_period_idx
  ON company_expenses (start_month, end_month, recurrence);

CREATE INDEX IF NOT EXISTS company_expenses_category_idx
  ON company_expenses (category);
