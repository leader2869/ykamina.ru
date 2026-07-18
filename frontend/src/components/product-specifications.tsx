export type SpecificationGroups = Record<string, Record<string, string>>;

export function ProductSpecifications({ specifications }: { specifications?: SpecificationGroups }) {
  if (!specifications || !Object.keys(specifications).length) return null;
  const hiddenLabels = new Set(['Производитель', 'Компания-производитель']);
  return <section className="mt-10 border-t border-ink/10 pt-8"><h2 className="font-serif text-3xl">Характеристики</h2><div className="mt-6 space-y-7">{Object.entries(specifications).map(([group, values]) => { const visible = Object.entries(values).filter(([label]) => !hiddenLabels.has(label)); return visible.length ? <div key={group}><h3 className="text-xs font-semibold uppercase tracking-[.14em] text-terracotta">{group}</h3><dl className="mt-3 divide-y divide-ink/10">{visible.map(([label, value]) => <div key={label} className="grid grid-cols-2 gap-4 py-2.5 text-sm"><dt className="text-ink/55">{label}</dt><dd className="font-medium text-ink">{value}</dd></div>)}</dl></div> : null; })}</div></section>;
}
