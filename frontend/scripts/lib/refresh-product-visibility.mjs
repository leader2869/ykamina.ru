export async function refreshProductVisibility(client) {
  const result = await client.query(`
    WITH visibility AS (
      SELECT p.id,
        CASE
          WHEN p.price <= 0 THEN 'Нет цены'
          WHEN COALESCE(jsonb_array_length(p.images), 0) = 0 THEN 'Нет фото'
          WHEN p.category_id IS NULL THEN 'Без категории'
          WHEN COALESCE(parent.slug, c.slug) = 'другое' THEN 'Служебная категория'
          ELSE NULL
        END AS reason
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE p.supplier_sku IS NOT NULL
    )
    UPDATE products p
    SET is_published = visibility.reason IS NULL,
        visibility_comment = visibility.reason,
        updated_at = CASE
          WHEN p.is_published IS DISTINCT FROM (visibility.reason IS NULL)
            OR p.visibility_comment IS DISTINCT FROM visibility.reason
          THEN NOW() ELSE p.updated_at
        END
    FROM visibility
    WHERE p.id = visibility.id
      AND (p.is_published IS DISTINCT FROM (visibility.reason IS NULL)
        OR p.visibility_comment IS DISTINCT FROM visibility.reason)
  `);
  return result.rowCount;
}
