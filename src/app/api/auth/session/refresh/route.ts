import { NextResponse, NextRequest } from 'next/server';
import { saveSession, deleteSession } from '@/lib/session-manager';
import { saveAccountToken } from '@/lib/alice';

/**
 * POST /api/auth/session/refresh
 * Refresh/update an OAuth session token
 * 
 * Request body:
 * {
 *   accountId: string,
 *   newToken: string,
 *   expiresIn?: number (in seconds, default 86400 = 24 hours)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { accountId, newToken, expiresIn } = body;

    if (!accountId || !newToken) {
      return NextResponse.json(
        { ok: false, message: 'Missing accountId or newToken' },
        { status: 400 }
      );
    }

    // Save the new token with metadata
    const session = saveSession(accountId, newToken, {
      expiresIn: expiresIn || 86400, // Default 24 hours
      source: 'oauth-vendor',
    });

    // Also save to old location for backward compatibility
    saveAccountToken(accountId, newToken);

    console.log(`[SESSION-REFRESH] Updated session for ${accountId}`);

    return NextResponse.json({
      ok: true,
      message: 'Session token updated',
      session: {
        accountId: session.accountId,
        tokenMask: `${session.token.slice(0, 10)}...${session.token.slice(-4)}`,
        expiresAt: new Date(session.expiresAt).toISOString(),
        isValid: session.isValid,
      },
    });
  } catch (err: any) {
    console.error('[SESSION-REFRESH] Error', err);
    return NextResponse.json({ ok: false, message: err?.message ?? 'Error' }, { status: 500 });
  }
}
