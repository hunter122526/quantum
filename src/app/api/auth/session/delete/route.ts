import { NextResponse, NextRequest } from 'next/server';
import { deleteSession, invalidateSession } from '@/lib/session-manager';

/**
 * POST /api/auth/session/delete
 * Admin endpoint to delete or invalidate a session
 * 
 * Request body:
 * {
 *   accountId: string,
 *   action: 'invalidate' | 'delete'  (default: invalidate)
 * }
 * 
 * invalidate: Marks session as invalid (can be restored)
 * delete: Completely removes session (clean slate)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { accountId, action } = body;

    if (!accountId) {
      return NextResponse.json(
        { ok: false, message: 'Missing accountId' },
        { status: 400 }
      );
    }

    const actionType = action === 'delete' ? 'delete' : 'invalidate';

    if (actionType === 'delete') {
      deleteSession(accountId);
      console.log(`[SESSION-DELETE] Deleted session for ${accountId}`);
    } else {
      invalidateSession(accountId);
      console.log(`[SESSION-DELETE] Invalidated session for ${accountId}`);
    }

    return NextResponse.json({
      ok: true,
      message: `Session ${actionType}d for ${accountId}`,
    });
  } catch (err: any) {
    console.error('[SESSION-DELETE] Error', err);
    return NextResponse.json({ ok: false, message: err?.message ?? 'Error' }, { status: 500 });
  }
}
