export type TBankTaxation = 'osn' | 'usn_income' | 'usn_income_outcome' | 'esn' | 'patent';
export type TBankTax = 'none' | 'vat0' | 'vat5' | 'vat7' | 'vat10' | 'vat22' | 'vat105' | 'vat107' | 'vat110' | 'vat122';
export type TBankPaymentMethod = 'full_prepayment' | 'prepayment' | 'advance' | 'full_payment';

export type TBankReceiptItem = {
  Name: string;
  Price: number;
  Quantity: number;
  Amount: number;
  PaymentMethod: TBankPaymentMethod;
  PaymentObject: 'commodity';
  Tax: TBankTax;
  MeasurementUnit?: 'шт';
};

export type TBankReceipt = {
  Email: string;
  Phone?: string;
  Taxation: TBankTaxation;
  Items: TBankReceiptItem[];
};

const taxations: TBankTaxation[] = ['osn', 'usn_income', 'usn_income_outcome', 'esn', 'patent'];
const taxes: TBankTax[] = ['none', 'vat0', 'vat5', 'vat7', 'vat10', 'vat22', 'vat105', 'vat107', 'vat110', 'vat122'];
const paymentMethods: TBankPaymentMethod[] = ['full_prepayment', 'prepayment', 'advance', 'full_payment'];

export function buildTBankReceipt(
  items: { name: string; priceKopecks: number; quantity: number }[],
  contact: { email: string; phone?: string },
): TBankReceipt {
  const taxation = process.env.TBANK_TAXATION as TBankTaxation;
  const tax = process.env.TBANK_TAX as TBankTax;
  const paymentMethod = (process.env.TBANK_PAYMENT_METHOD || 'full_prepayment') as TBankPaymentMethod;
  const ffdVersion = process.env.TBANK_FFD_VERSION || '1.2';
  if (!taxations.includes(taxation)) throw new Error('Не задана система налогообложения для чеков Т‑Банка');
  if (!taxes.includes(tax)) throw new Error('Не задана ставка НДС для чеков Т‑Банка');
  if (!paymentMethods.includes(paymentMethod)) throw new Error('Некорректный способ расчёта для чеков Т‑Банка');
  if (!['1.05', '1.2'].includes(ffdVersion)) throw new Error('Поддерживаются ФФД 1.05 и 1.2');

  return {
    Email: contact.email,
    ...(contact.phone && { Phone: contact.phone }),
    Taxation: taxation,
    Items: items.map((item) => ({
      Name: item.name.slice(0, 128),
      Price: item.priceKopecks,
      Quantity: item.quantity,
      Amount: item.priceKopecks * item.quantity,
      PaymentMethod: paymentMethod,
      PaymentObject: 'commodity',
      Tax: tax,
      ...(ffdVersion === '1.2' && { MeasurementUnit: 'шт' as const }),
    })),
  };
}
