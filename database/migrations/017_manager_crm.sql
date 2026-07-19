CREATE TABLE IF NOT EXISTS sales_clients (
  id BIGSERIAL PRIMARY KEY,
  manager_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(180) NOT NULL,
  phone VARCHAR(64),
  email VARCHAR(254),
  city VARCHAR(160),
  source VARCHAR(32) NOT NULL DEFAULT 'manager',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  notes TEXT,
  last_contact_at TIMESTAMPTZ,
  next_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL),
  CHECK (source IN ('manager', 'website', 'phone', 'messenger', 'recommendation', 'other')),
  CHECK (status IN ('active', 'vip', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_clients_manager_email_idx
  ON sales_clients(manager_user_id, LOWER(email)) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS sales_clients_manager_updated_idx
  ON sales_clients(manager_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS sales_deals (
  id BIGSERIAL PRIMARY KEY,
  manager_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES sales_clients(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  stage VARCHAR(32) NOT NULL DEFAULT 'new',
  amount_kopecks BIGINT NOT NULL DEFAULT 0 CHECK (amount_kopecks >= 0),
  probability SMALLINT NOT NULL DEFAULT 20 CHECK (probability BETWEEN 0 AND 100),
  product_interest TEXT,
  notes TEXT,
  expected_close_date DATE,
  next_contact_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (stage IN ('new', 'qualification', 'proposal', 'negotiation', 'awaiting_payment', 'won', 'lost'))
);

CREATE INDEX IF NOT EXISTS sales_deals_manager_stage_idx
  ON sales_deals(manager_user_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS sales_deals_client_idx ON sales_deals(client_id);

CREATE TABLE IF NOT EXISTS sales_tasks (
  id BIGSERIAL PRIMARY KEY,
  manager_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES sales_clients(id) ON DELETE SET NULL,
  deal_id BIGINT REFERENCES sales_deals(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  priority VARCHAR(16) NOT NULL DEFAULT 'normal',
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (priority IN ('low', 'normal', 'high')),
  CHECK (status IN ('open', 'done', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS sales_tasks_manager_due_idx
  ON sales_tasks(manager_user_id, status, due_at);

CREATE TABLE IF NOT EXISTS sales_activities (
  id BIGSERIAL PRIMARY KEY,
  manager_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  client_id BIGINT REFERENCES sales_clients(id) ON DELETE CASCADE,
  deal_id BIGINT REFERENCES sales_deals(id) ON DELETE CASCADE,
  action VARCHAR(48) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_activities_manager_created_idx
  ON sales_activities(manager_user_id, created_at DESC);

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS sales_client_id BIGINT REFERENCES sales_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_deal_id BIGINT REFERENCES sales_deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payment_orders_sales_client_idx ON payment_orders(sales_client_id);
CREATE INDEX IF NOT EXISTS payment_orders_sales_deal_idx ON payment_orders(sales_deal_id);

-- Удаляем только подтвержденные тестовые операции, созданные при настройке эквайринга.
DELETE FROM payment_orders WHERE id IN (
  'a5150e5b-62ed-4dca-b67a-a2ea938d87cb',
  'fbfc5c4e-74dc-4afa-9649-eb2786de7341',
  'e58e55d5-9c2b-4a5a-ab97-2de52811a552',
  'f49ecfe8-7b5d-488f-8bec-a9a91e491b84',
  '1983bd72-56f3-487d-bf12-ddfbe92b27d3',
  '798942af-283f-4eb8-96a0-3e8f2e9ae2b8',
  '99a1a4b9-62f4-4e14-a318-994f4fc60846',
  'ceafaaa0-b1c7-49f8-9b3f-c95dcac71150',
  '1a46aded-0586-4201-a9c7-14155b5a912f',
  'd8ac6169-d8d7-4975-bed9-88c5c1a608cf',
  '98b72c99-6fce-40cb-be11-74bea56ee472',
  '3edd1f81-f0ac-4bb0-91a8-d85587b404a6',
  '30faea33-fe59-4f37-9720-797582d1290e',
  '8f94af24-05b7-444a-93c3-46191883ab24',
  'd2c677bf-991c-4d4a-893b-c7914180ddc5',
  '84f1e170-5b42-47fc-8869-77798ebb62fa'
);

DELETE FROM users WHERE LOWER(email) = 'test@test.ru' AND LOWER(full_name) LIKE '%тест%';
