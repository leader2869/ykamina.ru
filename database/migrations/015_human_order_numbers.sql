ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS order_number VARCHAR(32),
  ADD COLUMN IF NOT EXISTS order_sequence INTEGER;

WITH numbered_orders AS (
  SELECT id,
    ROW_NUMBER() OVER (ORDER BY paid_at, created_at, id) AS sequence_number,
    TO_CHAR(paid_at AT TIME ZONE 'Europe/Moscow', 'DDMMYY') AS payment_date
  FROM payment_orders
  WHERE paid_at IS NOT NULL AND order_number IS NULL
)
UPDATE payment_orders AS orders
SET order_sequence = numbered_orders.sequence_number,
    order_number = numbered_orders.payment_date || '-' || LPAD(numbered_orders.sequence_number::text, 3, '0')
FROM numbered_orders
WHERE orders.id = numbered_orders.id;

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_order_number_idx
  ON payment_orders(order_number) WHERE order_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_sequence_idx
  ON payment_orders(order_sequence) WHERE order_sequence IS NOT NULL;
