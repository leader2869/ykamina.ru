ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(32) NOT NULL DEFAULT 'tbank';

CREATE INDEX IF NOT EXISTS payment_orders_provider_idx
  ON payment_orders(payment_provider);
