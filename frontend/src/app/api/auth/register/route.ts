import { NextResponse } from 'next/server';
import { createSession, registerCustomer, sessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fullName, phone, email, birthDate, deliveryAddress, password } = body as Record<string, string>;
    if (![fullName, phone, email, birthDate, deliveryAddress, password].every((value) => typeof value === 'string' && value.trim())) return NextResponse.json({ error: 'Заполните все поля.' }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Введите корректный email.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Пароль должен содержать минимум 8 символов.' }, { status: 400 });
    const userId = await registerCustomer({ fullName, phone, email, birthDate, deliveryAddress, password });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie(await createSession(userId), request));
    return response;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'Пользователь с таким email уже зарегистрирован.' }, { status: 409 });
    return NextResponse.json({ error: 'Не удалось создать аккаунт. Попробуйте ещё раз.' }, { status: 500 });
  }
}
