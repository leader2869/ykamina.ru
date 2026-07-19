CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY,
  status VARCHAR(40) NOT NULL DEFAULT 'created',
  amount_kopecks BIGINT NOT NULL CHECK (amount_kopecks > 0),
  customer_name VARCHAR(160) NOT NULL,
  customer_email VARCHAR(254) NOT NULL,
  customer_phone VARCHAR(64) NOT NULL,
  delivery_city VARCHAR(160) NOT NULL,
  customer_comment TEXT,
  items JSONB NOT NULL,
  tbank_payment_id VARCHAR(64),
  bank_notification JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_orders_status_idx ON payment_orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_tbank_payment_id_idx
  ON payment_orders(tbank_payment_id) WHERE tbank_payment_id IS NOT NULL;
