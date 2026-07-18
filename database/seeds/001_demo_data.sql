INSERT INTO categories (id, name, slug, description) VALUES
  (1, 'Дровяные камины', 'wood-burning', 'Классические решения с живым огнём.'),
  (2, 'Газовые камины', 'gas', 'Точный контроль тепла и пламени.'),
  (3, 'Электрокамины', 'electric', 'Атмосфера огня без дымохода.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO suppliers (id, name, url, api_key) VALUES
  (1, 'Demo Fire Supply', 'https://example.com', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, name, slug, description, price, old_price, category_id, images, stock, dimensions, weight) VALUES
  (1, 'Nord Flame Oslo 75', 'nord-flame-oslo-75', 'Лаконичный дровяной камин с панорамным стеклом для просторной гостиной.', 349000, 389000, 1, '["https://images.unsplash.com/photo-1544984243-ec57ea16fe25?auto=format&fit=crop&w=1200&q=85"]', 4, '{"width": 750, "height": 1120, "depth": 500}', 185),
  (2, 'Ember Line 60', 'ember-line-60', 'Компактный электрический очаг с реалистичным эффектом пламени.', 129000, NULL, 3, '["https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=1200&q=85"]', 12, '{"width": 600, "height": 500, "depth": 250}', 34),
  (3, 'Atelier Noir 90', 'atelier-noir-90', 'Французская топка из чёрной стали для современных интерьеров.', 478000, 529000, 1, '["https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=85"]', 2, '{"width": 900, "height": 970, "depth": 540}', 210),
  (4, 'Terra Gas View', 'terra-gas-view', 'Газовый камин с широким фронтальным стеклом и дистанционным управлением.', 415000, NULL, 2, '["https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85"]', 5, '{"width": 800, "height": 850, "depth": 400}', 118),
  (5, 'Siena Portal 50', 'siena-portal-50', 'Электрокамин в портале из светлого шпона для квартиры или загородного дома.', 159000, 179000, 3, '["https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=85"]', 9, '{"width": 1040, "height": 980, "depth": 380}', 61),
  (6, 'Fjord Steel 80', 'fjord-steel-80', 'Дровяная печь-камин с высокой теплоотдачей и системой чистого стекла.', 295000, NULL, 1, '["https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=85"]', 6, '{"width": 710, "height": 1260, "depth": 480}', 154)
ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, old_price = EXCLUDED.old_price, stock = EXCLUDED.stock, updated_at = NOW();

SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));
SELECT setval('suppliers_id_seq', (SELECT MAX(id) FROM suppliers));
SELECT setval('products_id_seq', (SELECT MAX(id) FROM products));

INSERT INTO prices (product_id, supplier_id, price) VALUES
  (1, 1, 332000), (2, 1, 120000), (3, 1, 460000), (4, 1, 398000), (5, 1, 151000), (6, 1, 281000)
ON CONFLICT (product_id, supplier_id) DO UPDATE SET price = EXCLUDED.price, updated_at = NOW();
