ALTER TABLE sales_deals
  ADD COLUMN IF NOT EXISTS purchase_cost_kopecks BIGINT;

ALTER TABLE sales_deals
  DROP CONSTRAINT IF EXISTS sales_deals_purchase_cost_non_negative;

ALTER TABLE sales_deals
  ADD CONSTRAINT sales_deals_purchase_cost_non_negative
  CHECK (purchase_cost_kopecks IS NULL OR purchase_cost_kopecks >= 0);

WITH order_costs AS (
  SELECT o.sales_deal_id,
    SUM((item->>'purchaseCostKopecks')::bigint * (item->>'quantity')::integer) AS purchase_cost,
    BOOL_AND(item ? 'purchaseCostKopecks') AS has_complete_cost
  FROM payment_orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.items) item
  WHERE o.sales_deal_id IS NOT NULL
  GROUP BY o.sales_deal_id
)
UPDATE sales_deals d
SET purchase_cost_kopecks = costs.purchase_cost
FROM order_costs costs
WHERE d.id = costs.sales_deal_id
  AND costs.has_complete_cost
  AND d.purchase_cost_kopecks IS NULL;

CREATE INDEX IF NOT EXISTS sales_deals_missing_purchase_cost_idx
  ON sales_deals (manager_user_id, stage)
  WHERE stage = 'won' AND purchase_cost_kopecks IS NULL;
