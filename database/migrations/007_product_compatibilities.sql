CREATE TABLE IF NOT EXISTS product_compatibilities (
  hearth_product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  portal_product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hearth_product_id, portal_product_id),
  CHECK (hearth_product_id <> portal_product_id)
);

CREATE INDEX IF NOT EXISTS product_compatibilities_portal_idx
  ON product_compatibilities (portal_product_id);
