ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS manager_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_url TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_source_check;
ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_source_check CHECK (source IN ('website', 'manager'));

CREATE INDEX IF NOT EXISTS payment_orders_source_idx ON payment_orders(source);
CREATE INDEX IF NOT EXISTS payment_orders_manager_idx ON payment_orders(manager_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_paid_at_idx ON payment_orders(paid_at DESC) WHERE paid_at IS NOT NULL;
