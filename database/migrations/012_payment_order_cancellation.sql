ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_response JSONB;

CREATE INDEX IF NOT EXISTS payment_orders_created_at_idx ON payment_orders(created_at DESC);
