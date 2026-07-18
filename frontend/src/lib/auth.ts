import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';
import { cookies } from 'next/headers';
import { Pool } from 'pg';

export type UserRole = 'customer' | 'sales_manager' | 'super_admin';
export type CurrentUser = { id: string; role: UserRole; fullName: string; phone: string; email: string; birthDate: string; deliveryAddress: string };

const globalForAuth = global as typeof globalThis & { authPool?: Pool };
const pool = process.env.DATABASE_URL ? (globalForAuth.authPool ??= new Pool({ connectionString: process.env.DATABASE_URL })) : null;
export const sessionCookieName = 'ykamina_session';

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(userId: string | number) {
  if (!pool) throw new Error('База данных недоступна');
  const token = randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')', [userId, tokenHash(token)]);
  return token;
}

export function sessionCookie(token: string, request: Request) {
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const secure = forwardedProtocol ? forwardedProtocol === 'https' : new URL(request.url).protocol === 'https:';
  return { name: sessionCookieName, value: token, httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: 60 * 60 * 24 * 30 };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!pool) return null;
  const token = cookies().get(sessionCookieName)?.value;
  if (!token) return null;
  const result = await pool.query<{
    id: string; role: UserRole; full_name: string; phone: string; email: string; birth_date: string; delivery_address: string;
  }>(`SELECT u.id, u.role, u.full_name, u.phone, u.email, u.birth_date, u.delivery_address
      FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = TRUE LIMIT 1`, [tokenHash(token)]);
  const user = result.rows[0];
  if (!user) return null;
  return { id: user.id, role: user.role, fullName: user.full_name, phone: user.phone, email: user.email, birthDate: user.birth_date, deliveryAddress: user.delivery_address };
}

export async function registerCustomer(input: { fullName: string; phone: string; email: string; birthDate: string; deliveryAddress: string; password: string }) {
  if (!pool) throw new Error('База данных недоступна');
  const result = await pool.query<{ id: string }>(`INSERT INTO users (full_name, phone, email, birth_date, delivery_address, password_hash)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [input.fullName.trim(), input.phone.trim(), normalizeEmail(input.email), input.birthDate, input.deliveryAddress.trim(), hashPassword(input.password)]);
  return result.rows[0].id;
}

export async function loginWithPassword(email: string, password: string) {
  if (!pool) throw new Error('База данных недоступна');
  const result = await pool.query<{ id: string; password_hash: string }>('SELECT id, password_hash FROM users WHERE LOWER(email) = $1 AND is_active = TRUE LIMIT 1', [normalizeEmail(email)]);
  const user = result.rows[0];
  return user && verifyPassword(password, user.password_hash) ? user.id : null;
}
