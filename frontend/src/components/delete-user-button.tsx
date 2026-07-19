'use client';

export function DeleteUserButton({ userName, disabled = false }: { userName: string; disabled?: boolean }) {
  return <button type="submit" disabled={disabled} onClick={(event) => {
    if (!window.confirm(`Удалить пользователя «${userName}»? Его активные сессии будут завершены. Отменить это действие будет невозможно.`)) event.preventDefault();
  }} className="rounded-xl border border-red-200 px-4 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30">Удалить пользователя</button>;
}
