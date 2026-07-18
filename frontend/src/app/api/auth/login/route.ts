import { NextResponse } from 'next/server';
import { createSession, loginWithPassword, sessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json() as { email?: string; password?: string };
    if (!email || !password) return NextResponse.json({ error: 'Введите email и пароль.' }, { status: 400 });
    const userId = await loginWithPassword(email, password);
    if (!userId) return NextResponse.json({ error: 'Неверный email или пароль.' }, { status: 401 });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie(await createSession(userId), request));
    return response;
  } catch { return NextResponse.json({ error: 'Не удалось войти. Попробуйте ещё раз.' }, { status: 500 }); }
}
