'use client';

export function CancelOrderButton({ paid }: { paid: boolean }) {
  return <button type="submit" onClick={(event) => {
    const message = paid
      ? 'Отменить заказ и отправить полный возврат платежа в Т‑Банк? Это действие нельзя отменить.'
      : 'Отменить этот заказ? Это действие нельзя отменить.';
    if (!window.confirm(message)) event.preventDefault();
  }} className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50">{paid ? 'Отменить и вернуть' : 'Отменить заказ'}</button>;
}
