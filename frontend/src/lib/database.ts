export function getDatabaseConnectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) return null;

  const url = new URL(value);
  if (process.env.DATABASE_PUBLIC_HOST) url.hostname = process.env.DATABASE_PUBLIC_HOST;
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') url.searchParams.set('sslmode', 'no-verify');
  return url.toString();
}
