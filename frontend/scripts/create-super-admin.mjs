import { randomBytes, scryptSync } from 'node:crypto';
import pg from 'pg';

const generateCredentials = process.argv.includes('--generate');
const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase()
  || (generateCredentials ? 'admin@ykamina.ru' : undefined);
const password = process.env.SUPER_ADMIN_PASSWORD
  || (generateCredentials ? randomBytes(18).toString('base64url') : undefined);
const fullName = process.env.SUPER_ADMIN_NAME?.trim() || 'Суперадминистратор';
const phone = process.env.SUPER_ADMIN_PHONE?.trim() || '+7 000 000-00-00';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL не задан');
if (!email) throw new Error('Задайте SUPER_ADMIN_EMAIL');
if (!password || password.length < 8) throw new Error('SUPER_ADMIN_PASSWORD должен содержать минимум 8 символов');

const salt = randomBytes(16).toString('hex');
const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const result = await client.query(
    `INSERT INTO users (role, full_name, phone, email, birth_date, delivery_address, password_hash)
     VALUES ('super_admin', $1, $2, $3, DATE '1970-01-01', 'Не используется', $4)
     ON CONFLICT ((LOWER(email))) DO UPDATE SET
       role = 'super_admin', full_name = EXCLUDED.full_name, phone = EXCLUDED.phone,
       password_hash = EXCLUDED.password_hash, is_active = TRUE, updated_at = NOW()
     RETURNING id, email`,
    [fullName, phone, email, passwordHash],
  );
  console.log(`Суперадминистратор ${result.rows[0].email} готов к работе.`);
  if (generateCredentials && !process.env.SUPER_ADMIN_PASSWORD) {
    console.log(`Одноразовый пароль: ${password}`);
  }
} finally {
  await client.end();
}
