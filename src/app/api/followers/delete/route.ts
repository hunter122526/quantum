import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';

/**
 * DELETE /api/followers/delete?id=<accountId>
 * Delete a follower from the database
 */
export async function DELETE(req: NextRequest) {
  try {
    const accountId = new URL(req.url).searchParams.get('id');

    if (!accountId) {
      return NextResponse.json(
        { ok: false, message: 'Missing accountId parameter' },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    // Delete follower from database
    const result = await db.query('DELETE FROM followers WHERE id = ?', [accountId]);

    if (Array.isArray(result) && result[0]?.affectedRows === 0) {
      return NextResponse.json(
        { ok: false, message: 'Follower not found' },
        { status: 404 }
      );
    }

    console.log(`[FOLLOWERS-DELETE] Successfully deleted follower: ${accountId}`);

    return NextResponse.json({
      ok: true,
      message: 'Follower deleted successfully',
    });
  } catch (error: any) {
    console.error('[FOLLOWERS-DELETE] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || 'Failed to delete follower',
      },
      { status: 500 }
    );
  }
}
