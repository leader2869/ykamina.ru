INSERT INTO sales_deals
  (manager_user_id, client_id, title, stage, amount_kopecks, probability, product_interest, notes, next_contact_at, created_at, updated_at)
SELECT
  a.manager_user_id,
  a.client_id,
  LEFT('Заявка с сайта: ' || c.full_name, 240),
  'new',
  0,
  20,
  NULL,
  a.description,
  a.created_at,
  a.created_at,
  a.created_at
FROM sales_activities a
JOIN sales_clients c ON c.id = a.client_id
WHERE a.action = 'website.lead_created'
  AND a.client_id IS NOT NULL
  AND a.manager_user_id IS NOT NULL
  AND a.deal_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sales_deals d
    WHERE d.client_id = a.client_id
      AND d.manager_user_id = a.manager_user_id
      AND d.created_at BETWEEN a.created_at - INTERVAL '1 minute' AND a.created_at + INTERVAL '1 minute'
  );
