import { NextResponse, NextRequest } from 'next/server';
import { invalidateSession } from '@/lib/session-manager';

export async function POST(req: NextRequest) {
  try {
    // Extract user info from cookie to invalidate their session
    const userCookie = req.cookies.get('alice_user');
    if (userCookie) {
      try {
        const user = JSON.parse(userCookie.value);
        if (user.id) {
          invalidateSession(user.id);
          console.log('[LOGOUT] Invalidated session for user:', user.id);
        }
      } catch (e) {
        console.warn('[LOGOUT] Failed to parse user cookie', e);
      }
    }

    const res = NextResponse.json({ ok: true, message: 'Logged out' });
    res.cookies.set('alice_user', '', { maxAge: 0, path: '/' });
    return res;
  } catch (err: any) {
    console.error('[LOGOUT] Error', err);
    const res = NextResponse.json({ ok: true, message: 'Logged out' });
    res.cookies.set('alice_user', '', { maxAge: 0, path: '/' });
    return res;
  }
}
