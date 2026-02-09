import { NextResponse, NextRequest } from 'next/server';
import { isSessionValid, getSessionInfo, cleanupExpiredSessions } from '@/lib/session-manager';

/**
 * POST /api/auth/session/verify
 * Verify if a master session is still valid and not expired
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const accountId = body.accountId;

    if (!accountId) {
      return NextResponse.json(
        { ok: false, message: 'Missing accountId' },
        { status: 400 }
      );
    }

    // Clean up any expired sessions while we're at it
    cleanupExpiredSessions();

    const isValid = isSessionValid(accountId);

    if (isValid) {
      const info = getSessionInfo(accountId);
      return NextResponse.json({
        ok: true,
        valid: true,
        session: info,
      });
    } else {
      return NextResponse.json({
        ok: true,
        valid: false,
        message: 'Session expired or invalid',
      });
    }
  } catch (err: any) {
    console.error('[SESSION-VERIFY] Error', err);
    return NextResponse.json({ ok: false, message: err?.message ?? 'Error' }, { status: 500 });
  }
}
