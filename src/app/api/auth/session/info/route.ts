import { NextResponse, NextRequest } from 'next/server';
import { getSessionInfo } from '@/lib/session-manager';

/**
 * GET /api/auth/session/info?accountId=<id>
 * Get detailed session information including expiry time
 */
export async function GET(req: NextRequest) {
  try {
    const accountId = new URL(req.url).searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { ok: false, message: 'Missing accountId' },
        { status: 400 }
      );
    }

    const info = getSessionInfo(accountId);

    if (!info) {
      return NextResponse.json({
        ok: true,
        session: null,
        message: 'No session found for this account',
      });
    }

    return NextResponse.json({
      ok: true,
      session: info,
    });
  } catch (err: any) {
    console.error('[SESSION-INFO] Error', err);
    return NextResponse.json({ ok: false, message: err?.message ?? 'Error' }, { status: 500 });
  }
}
