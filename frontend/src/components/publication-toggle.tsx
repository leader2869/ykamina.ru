'use client';

export function PublicationToggle({ isPublished, productName }: { isPublished: boolean; productName: string }) {
  function confirmChange(event: React.MouseEvent<HTMLButtonElement>) {
    const message = isPublished
      ? `Скрыть товар «${productName}»? Он исчезнет из каталога покупателей.`
      : `Опубликовать товар «${productName}»? Он станет доступен покупателям.`;
    if (!window.confirm(message)) event.preventDefault();
  }

  return <button type="submit" role="switch" aria-checked={isPublished} aria-label={isPublished ? 'Снять товар с публикации' : 'Опубликовать товар'} title={isPublished ? 'Снять с публикации' : 'Опубликовать'} onClick={confirmChange} className={`relative h-6 w-11 shrink-0 rounded-full transition ${isPublished ? 'bg-emerald-500' : 'bg-ink/20'}`}>
    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${isPublished ? 'left-6' : 'left-1'}`} />
  </button>;
}
