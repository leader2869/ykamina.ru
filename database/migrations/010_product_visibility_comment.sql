ALTER TABLE products
  ADD COLUMN IF NOT EXISTS visibility_comment TEXT;

UPDATE products p
SET visibility_comment = CASE
  WHEN p.is_published = TRUE THEN NULL
  WHEN p.price <= 0 THEN 'Нет цены'
  WHEN COALESCE(jsonb_array_length(p.images), 0) = 0 THEN 'Нет фото'
  WHEN p.category_id IS NULL THEN 'Без категории'
  WHEN EXISTS (
    SELECT 1
    FROM categories c
    LEFT JOIN categories parent ON parent.id = c.parent_id
    WHERE c.id = p.category_id AND COALESCE(parent.slug, c.slug) = 'другое'
  ) THEN 'Служебная категория'
  ELSE 'Скрыт вручную'
END;
