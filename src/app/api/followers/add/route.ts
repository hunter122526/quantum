import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';

/**
 * POST /api/followers/add
 * Add a new follower account to the database
 * 
 * Request body:
 * {
 *   id: string,
 *   name: string,
 *   username: string,
 *   password: string,
 *   telegramId?: string,
 *   initialBalance: number,
 *   riskProfile: 'Conservative' | 'Moderate' | 'Aggressive',
 *   lotMultiplier: number,
 *   perAccountCap: number,
 *   dailyLossLimit: number,
 *   maxExposurePerSymbol: number,
 *   status?: 'Active' | 'Paused' | 'Disconnected'
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      username,
      password,
      telegramId,
      initialBalance,
      riskProfile,
      lotMultiplier,
      perAccountCap,
      dailyLossLimit,
      maxExposurePerSymbol,
      status = 'Active',
    } = body;

    // Validate required fields
    if (!id || !name || !username || !password) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Missing required fields: id, name, username, password',
        },
        { status: 400 }
      );
    }

    const db = await getDatabase();

    // Check if follower already exists
    const [existing] = await db.query('SELECT id FROM followers WHERE id = ?', [id]);
    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json(
        { ok: false, message: 'Follower with this ID already exists' },
        { status: 409 }
      );
    }

    // Insert into database
    await db.query(
      `INSERT INTO followers 
       (id, name, username, password, telegram_id, initial_balance, risk_profile, lot_multiplier, per_account_cap, daily_loss_limit, max_exposure_per_symbol, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        username,
        password,
        telegramId || null,
        initialBalance,
        riskProfile,
        lotMultiplier,
        perAccountCap,
        dailyLossLimit,
        maxExposurePerSymbol,
        status,
      ]
    );

    console.log(`[FOLLOWERS-ADD] Successfully added follower: ${id} (${name})`);

    return NextResponse.json({
      ok: true,
      message: 'Follower added successfully to database',
      follower: {
        id,
        name,
        username,
      },
    });
  } catch (error: any) {
    console.error('[FOLLOWERS-ADD] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || 'Failed to add follower',
      },
      { status: 500 }
    );
  }
}
