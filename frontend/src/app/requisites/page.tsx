const requisites = [
  ['Наименование', 'Индивидуальный предприниматель Литвинюк Виталий Александрович'],
  ['ИНН', '780643680218'],
  ['ОГРНИП', '321470400096032'],
  ['Расчётный счёт', '40802810600009140746'],
  ['Банк', 'АО «ТБанк»'],
  ['БИК', '044525974'],
  ['ИНН банка', '7710140679'],
  ['Корреспондентский счёт', '30101810145250000974'],
  ['Юридический адрес банка', '127287, г. Москва, ул. Хуторская 2-я, д. 38А, стр. 26'],
];

export default function RequisitesPage() {
  return <section className="container-page py-12 sm:py-20">
    <p className="text-xs text-ink/45">Главная <span className="mx-2">/</span> Реквизиты</p>
    <div className="mt-6 max-w-3xl">
      <p className="eyebrow">Ykamina.ru — У камина</p>
      <h1 className="mt-3 font-serif text-5xl tracking-[-.05em] sm:text-6xl">Реквизиты</h1>
      <p className="mt-5 text-sm leading-6 text-ink/60">Информация для оплаты и оформления документов.</p>
    </div>
    <dl className="mt-10 max-w-4xl divide-y divide-[#e9e5df] border-y border-[#e9e5df]">
      {requisites.map(([label, value]) => <div key={label} className="grid gap-2 py-5 sm:grid-cols-[200px_1fr] sm:gap-8"><dt className="text-xs font-semibold uppercase tracking-[.12em] text-ink/50">{label}</dt><dd className="text-sm leading-6 text-ink">{value}</dd></div>)}
    </dl>
  </section>;
}
