import { createHash } from 'node:crypto';
import type { TBankReceipt } from '@/lib/tbank-receipt';

const endpoint = process.env.TBANK_API_URL || 'https://securepay.tinkoff.ru/v2/Init';

function endpointFor(method: string) {
  return new URL(`/v2/${method}`, endpoint).toString();
}

type InitRequest = {
  TerminalKey: string;
  Amount: number;
  OrderId: string;
  Description: string;
  PayType: 'O';
  Language: 'ru';
  SuccessURL: string;
  FailURL: string;
  NotificationURL: string;
  DATA?: { Email?: string; Phone?: string };
  Receipt: TBankReceipt;
};

type InitResponse = {
  Success: boolean;
  ErrorCode: string;
  Message?: string;
  Details?: string;
  PaymentId?: string;
  PaymentURL?: string;
};

export type CancelResponse = {
  Success: boolean;
  ErrorCode: string;
  Message?: string;
  Details?: string;
  Status?: string;
  PaymentId?: string;
  OrderId?: string;
  OriginalAmount?: number;
  NewAmount?: number;
};

export function createTBankToken(payload: Record<string, unknown>, password: string) {
  const values = Object.entries({ ...payload, Password: password })
    .filter(([key, value]) => key !== 'Token' && value !== undefined && value !== null && typeof value !== 'object')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => String(value))
    .join('');
  return createHash('sha256').update(values, 'utf8').digest('hex');
}

export async function initTBankPayment(payload: Omit<InitRequest, 'TerminalKey'>) {
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  const password = process.env.TBANK_PASSWORD;
  if (!terminalKey || !password) throw new Error('Платежный терминал не настроен');

  const body: InitRequest & { Token: string } = {
    TerminalKey: terminalKey,
    ...payload,
    Token: '',
  };
  body.Token = createTBankToken(body, password);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Т‑Банк вернул HTTP ${response.status}`);
  const result = await response.json() as InitResponse;
  if (!result.Success || !result.PaymentURL) throw new Error(result.Details || result.Message || `Ошибка Т‑Банка ${result.ErrorCode}`);
  return result;
}

export async function cancelTBankPayment(paymentId: string) {
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  const password = process.env.TBANK_PASSWORD;
  if (!terminalKey || !password) throw new Error('Платежный терминал не настроен');

  const body = { TerminalKey: terminalKey, PaymentId: paymentId, Token: '' };
  body.Token = createTBankToken(body, password);
  const response = await fetch(endpointFor('Cancel'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Т‑Банк вернул HTTP ${response.status}`);
  const result = await response.json() as CancelResponse;
  if (!result.Success) throw new Error(result.Details || result.Message || `Ошибка Т‑Банка ${result.ErrorCode}`);
  return result;
}
