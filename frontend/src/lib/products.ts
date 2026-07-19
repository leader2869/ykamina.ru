export type Product = {
  id: string;
  name: string;
  slug: string;
  type: string;
  parentType?: string;
  price: number;
  oldPrice?: number;
  image: string;
  images: string[];
  dimensions: string;
  description: string;
  stock: number;
  article?: string;
  dimensionsData?: { width?: number; height?: number; depth?: number };
  availability?: { moscow?: string | null; saintPetersburg?: string | null };
  isPublished?: boolean;
  visibilityComment?: string | null;
  specifications?: Record<string, Record<string, string>>;
};

const normalizedAvailability = (product: Product) => [
  product.availability?.moscow,
  product.availability?.saintPetersburg,
].filter((value): value is string => Boolean(value)).map((value) => value.trim().toLocaleLowerCase('ru-RU'));

export function catalogProductRank(product: Product) {
  const availability = normalizedAvailability(product);
  if (availability.includes('много')) return 0;
  if (availability.includes('мало')) return 1;
  const hasDescription = Boolean(product.description?.trim());
  const hasSpecifications = Boolean(product.specifications && Object.keys(product.specifications).length);
  const hasDimensions = Boolean(product.dimensionsData && Object.values(product.dimensionsData).some(Boolean));
  return hasDescription && (hasSpecifications || hasDimensions) ? 2 : 3;
}

export function compareCatalogProducts(left: Product, right: Product) {
  return catalogProductRank(left) - catalogProductRank(right)
    || left.name.localeCompare(right.name, 'ru');
}

export const products: Product[] = [
  ...[
    { id: '1', name: 'Nord Flame Oslo 75', slug: 'nord-flame-oslo-75', type: 'Дровяной', price: 349000, oldPrice: 389000, image: 'https://images.unsplash.com/photo-1544984243-ec57ea16fe25?auto=format&fit=crop&w=1200&q=85', dimensions: '75 × 112 × 50 см', description: 'Панорамный дровяной камин с чистым стеклом для просторной гостиной.', stock: 4 },
    { id: '2', name: 'Ember Line 60', slug: 'ember-line-60', type: 'Электрический', price: 129000, image: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=1200&q=85', dimensions: '60 × 50 × 25 см', description: 'Компактный очаг с очень реалистичным эффектом живого огня.', stock: 12 },
    { id: '3', name: 'Atelier Noir 90', slug: 'atelier-noir-90', type: 'Дровяной', price: 478000, oldPrice: 529000, image: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=85', dimensions: '90 × 97 × 54 см', description: 'Французская топка из чёрной стали для современного интерьера.', stock: 2 },
    { id: '4', name: 'Terra Gas View', slug: 'terra-gas-view', type: 'Газовый', price: 415000, image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85', dimensions: '80 × 85 × 40 см', description: 'Газовый камин с широким стеклом и дистанционным управлением.', stock: 5 },
    { id: '5', name: 'Siena Portal 50', slug: 'siena-portal-50', type: 'Электрический', price: 159000, oldPrice: 179000, image: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=85', dimensions: '104 × 98 × 38 см', description: 'Очаг в портале из светлого шпона для квартиры и дома.', stock: 9 },
    { id: '6', name: 'Fjord Steel 80', slug: 'fjord-steel-80', type: 'Дровяной', price: 295000, image: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=85', dimensions: '71 × 126 × 48 см', description: 'Печь-камин с высокой теплоотдачей и системой чистого стекла.', stock: 6 },
  ].map((product) => ({ ...product, images: [product.image] })),
];

export const formatPrice = (price: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(price);
