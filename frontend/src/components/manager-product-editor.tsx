'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminCategory, AdminProductDetails } from '@/lib/admin';

export function ManagerProductEditor({ productId, categories, onClose }: { productId: string; categories: AdminCategory[]; onClose: () => void }) {
  const router = useRouter();
  const [product, setProduct] = useState<AdminProductDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputClass = 'mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-terracotta';

  useEffect(() => {
    fetch(`/api/manager/products/${productId}`).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить товар');
      setProduct(payload.data);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Не удалось загрузить товар')).finally(() => setLoading(false));
  }, [productId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/manager/products/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        name: form.get('name'), sku: form.get('sku'), categoryId: form.get('categoryId'), price: form.get('price'), oldPrice: form.get('oldPrice'),
        description: form.get('description'), images: String(form.get('images') || '').split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
        stock: form.get('stock'), width: form.get('width'), height: form.get('height'), depth: form.get('depth'), weight: form.get('weight'),
      }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить товар');
      router.refresh(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось сохранить товар'); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="mx-auto my-4 w-full max-w-4xl rounded-3xl bg-[#f7eee6] p-5 shadow-2xl sm:p-7">{loading ? <p className="py-20 text-center text-sm text-black/45">Загружаем карточку товара…</p> : product ? <form onSubmit={submit}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-terracotta">Карточка товара</p><h2 className="mt-2 font-serif text-3xl">Изменить товар</h2><p className="mt-2 text-sm text-black/50">Изменения сразу появятся в рабочем каталоге.</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-3 py-2 text-[10px] font-semibold ${product.isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{product.isPublished ? 'Опубликован' : 'Скрыт'}</span><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-white text-xl text-black/45">×</button></div></div><p className="mt-4 rounded-xl border border-black/[.06] bg-white/60 px-4 py-3 text-xs text-black/50">Статус публикации изменяет только суперадминистратор.</p>{error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<div className="mt-6 grid gap-5 lg:grid-cols-2"><label className="text-xs font-semibold text-black/65">Название *<input required minLength={2} name="name" defaultValue={product.name} className={inputClass}/></label><label className="text-xs font-semibold text-black/65">Артикул<input name="sku" defaultValue={product.sku} className={inputClass}/></label><label className="text-xs font-semibold text-black/65">Категория *<select required name="categoryId" defaultValue={product.categoryId || ''} className={inputClass}><option value="" disabled>Выберите категорию</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.parentName ? `${category.parentName} / ` : ''}{category.name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-black/65">Цена, ₽ *<input required type="number" min="0" step="0.01" name="price" defaultValue={product.price} className={inputClass}/></label><label className="text-xs font-semibold text-black/65">Старая цена, ₽<input type="number" min="0" step="0.01" name="oldPrice" defaultValue={product.oldPrice ?? ''} className={inputClass}/></label></div><label className="text-xs font-semibold text-black/65 lg:col-span-2">Описание<textarea name="description" defaultValue={product.description} className={`${inputClass} min-h-28 resize-y`}/></label><label className="text-xs font-semibold text-black/65 lg:col-span-2">Изображения<textarea name="images" defaultValue={product.images.join('\n')} placeholder="По одной ссылке на строку" className={`${inputClass} min-h-24 resize-y`}/><span className="mt-1.5 block font-normal text-black/40">Первое изображение используется как обложка.</span></label><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2"><label className="text-xs font-semibold text-black/65">Остаток, шт.<input type="number" min="0" step="1" name="stock" defaultValue={product.stock} className={inputClass}/></label><label className="text-xs font-semibold text-black/65">Ширина, мм<input type="number" min="0" step="0.1" name="width" defaultValue={product.dimensions.width ?? ''} className={inputClass}/></label><label className="text-xs font-semibold text-black/65">Высота, мм<input type="number" min="0" step="0.1" name="height" defaultValue={product.dimensions.height ?? ''} className={inputClass}/></label><label className="text-xs font-semibold text-black/65">Глубина, мм<input type="number" min="0" step="0.1" name="depth" defaultValue={product.dimensions.depth ?? ''} className={inputClass}/></label></div><label className="text-xs font-semibold text-black/65">Вес, кг<input type="number" min="0" step="0.01" name="weight" defaultValue={product.weight ?? ''} className={inputClass}/></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border border-black/15 bg-white px-5 py-3 text-xs font-semibold">Отмена</button><button disabled={saving} className="rounded-full bg-[#242421] px-6 py-3 text-xs font-semibold text-white transition hover:bg-terracotta disabled:opacity-50">{saving ? 'Сохраняем…' : 'Сохранить изменения'}</button></div></form> : <div className="py-16 text-center"><p className="text-sm text-red-700">{error || 'Товар не найден'}</p><button onClick={onClose} className="mt-5 rounded-full border border-black/15 px-5 py-2.5 text-xs font-semibold">Закрыть</button></div>}</div></div>;
}
