'use client';

export type CatalogFilters = {
  types: string[];
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
  width: string;
  height: string;
};

type Props = {
  value: CatalogFilters;
  onChange: (value: CatalogFilters) => void;
  onReset: () => void;
  priceRange: { min: number; max: number };
  types: string[];
};

const dimensionRanges = [
  { value: '', label: 'Любая' },
  { value: 'compact', label: 'до 60 см' },
  { value: 'medium', label: '60–100 см' },
  { value: 'large', label: 'от 100 см' },
];

export function Filters({ value, onChange, onReset, priceRange, types }: Props) {
  const update = (patch: Partial<CatalogFilters>) => onChange({ ...value, ...patch });
  const toggleType = (type: string) => update({ types: value.types.includes(type) ? value.types.filter((item) => item !== type) : [...value.types, type] });
  return <aside className="h-fit rounded-2xl border border-ink/10 bg-white p-5 md:sticky md:top-24">
    <div className="flex items-center justify-between"><h2 className="font-serif text-2xl">Фильтры</h2><button onClick={onReset} className="text-xs text-terracotta hover:underline">Сбросить</button></div>
    <div className="mt-6 space-y-6">
      <fieldset><legend className="mb-3 text-sm font-medium">По типу</legend><div className="space-y-1">{types.map((type) => <label key={type} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-porcelain"><span>{type}</span><input checked={value.types.includes(type)} onChange={() => toggleType(type)} type="checkbox" className="h-4 w-4 accent-terracotta" /></label>)}</div></fieldset>
      <fieldset><legend className="mb-3 text-sm font-medium">Розничная цена, ₽</legend><div className="grid grid-cols-2 gap-2"><input inputMode="numeric" value={value.minPrice} onChange={(event) => update({ minPrice: event.target.value.replace(/\D/g, '') })} placeholder={`от ${priceRange.min.toLocaleString('ru-RU')}`} className="min-w-0 rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-terracotta" /><input inputMode="numeric" value={value.maxPrice} onChange={(event) => update({ maxPrice: event.target.value.replace(/\D/g, '') })} placeholder={`до ${priceRange.max.toLocaleString('ru-RU')}`} className="min-w-0 rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-terracotta" /></div></fieldset>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-porcelain px-3 py-3 text-sm"><span>В наличии</span><input checked={value.inStock} onChange={(event) => update({ inStock: event.target.checked })} type="checkbox" className="h-4 w-4 accent-terracotta" /></label>
      <fieldset><legend className="mb-3 text-sm font-medium">Ширина</legend><select value={value.width} onChange={(event) => update({ width: event.target.value })} className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">{dimensionRanges.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}</select></fieldset>
      <fieldset><legend className="mb-3 text-sm font-medium">Высота</legend><select value={value.height} onChange={(event) => update({ height: event.target.value })} className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-terracotta">{dimensionRanges.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}</select></fieldset>
    </div>
  </aside>;
}
