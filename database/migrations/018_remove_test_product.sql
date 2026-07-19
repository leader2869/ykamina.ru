-- Удаляем только подтверждённый тестовый товар, созданный при проверке каталога.
DELETE FROM products
WHERE id = 6703
  AND LOWER(TRIM(name)) = 'тестовый товар'
  AND LOWER(TRIM(slug)) = 'тестовыи-товар'
  AND price = 12
  AND old_price = 15;
