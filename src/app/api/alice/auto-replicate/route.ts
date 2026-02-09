/**
 * POST /api/alice/auto-replicate
 * Automatically replicate NEW master trades to all active followers
 * Called after polling finds new trades
 */

import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDatabase } from '@/lib/db';
import { replicateTradeToFollowers, generateId } from '@/lib/replication-engine';

const INCOMING_FILE = process.env.QUANTUM_ALPHA_INCOMING_FILE || '.alice.incoming.json';
const MASTER_FILE = process.env.QUANTUM_MASTER_ACCOUNT_FILE || '.master.account';
const REPLICATED_FILE = process.env.QUANTUM_REPLICATED_TRADES_FILE || '.trades.replicated.json';

function readMasterAccountId(): string | null {
  try {
    if (fs.existsSync(MASTER_FILE)) {
      return fs.readFileSync(MASTER_FILE, 'utf-8').trim() || null;
    }
  } catch (e) {
    console.warn('Failed reading master account file', e);
  }
  return null;
}

function readIncoming(): Record<string, any[]> {
  try {
    if (fs.existsSync(INCOMING_FILE)) {
      return JSON.parse(fs.readFileSync(INCOMING_FILE, 'utf-8') || '{}');
    }
  } catch (e) {
    console.error('Failed reading incoming file', e);
  }
  return {};
}

function readReplicated(): Set<string> {
  try {
    if (fs.existsSync(REPLICATED_FILE)) {
      const data = JSON.parse(fs.readFileSync(REPLICATED_FILE, 'utf-8') || '[]');
      return new Set(data);
    }
  } catch (e) {
    console.error('Failed reading replicated trades file', e);
  }
  return new Set();
}

function writeReplicated(data: Set<string>) {
  try {
    fs.writeFileSync(REPLICATED_FILE, JSON.stringify(Array.from(data), null, 2), { encoding: 'utf-8', flag: 'w' });
  } catch (e) {
    console.error('Failed writing replicated trades file', e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDatabase();
    if (!db) {
      return NextResponse.json(
        { ok: false, message: 'Database connection failed' },
        { status: 500 }
      );
    }

    const masterAccountId = readMasterAccountId();
    if (!masterAccountId) {
      return NextResponse.json({ ok: true, message: 'No master account configured' });
    }

    const incoming = readIncoming();
    const masterTrades = incoming[masterAccountId] || [];
    const replicated = readReplicated();

    // Get all active followers
    const followers = await db.query(
      `
      SELECT fc.*, f.name 
      FROM follower_credentials fc
      JOIN followers f ON fc.follower_id = f.id
      WHERE fc.status = 'ACTIVE'
      `
    ) as Array<any>;

    if (followers.length === 0) {
      return NextResponse.json({ ok: true, message: 'No active followers', autoReplicated: 0 });
    }

    let autoReplicated = 0;

    // Process each master trade
    for (const trade of masterTrades) {
      const tradeId = trade.id || `MASTER-${trade.symbol}-${trade.side}-${Date.now()}`;
      
      // Skip if already replicated
      if (replicated.has(tradeId)) {
        continue;
      }

      // Check if this trade already has mappings (manual replication)
      const mappings = await db.query(
        `SELECT COUNT(*) as count FROM order_mappings WHERE master_order_id = ?`,
        [tradeId]
      ) as Array<any>;

      if (mappings[0]?.count > 0) {
        // Already replicated (manually or previously)
        replicated.add(tradeId);
        continue;
      }

      // Auto-replicate to all active followers
      let successCount = 0;
      let failCount = 0;

      // Use the main replication function with all followers
      const eventId = generateId();
      const results = await replicateTradeToFollowers(
        {
          id: tradeId,
          symbol: trade.symbol,
          side: trade.side.toUpperCase() as 'BUY' | 'SELL',
          quantity: trade.quantity || 1,
          price: trade.price || 0,
          order_type: trade.type || 'Market',
        },
        eventId
      );

      // Count results
      successCount = results.filter(r => r.status === 'SUCCESS').length;
      failCount = results.filter(r => r.status === 'FAILED').length;

      if (successCount > 0 || failCount > 0) {
        console.log(`✓ Auto-replicated trade ${tradeId}: ${successCount} succeeded, ${failCount} failed`);
        autoReplicated++;
        replicated.add(tradeId);
      }
    }

    // Save replicated trades
    writeReplicated(replicated);

    return NextResponse.json({
      ok: true,
      autoReplicated,
      totalFollowers: followers.length,
      message: `Auto-replicated ${autoReplicated} trades to ${followers.length} followers`,
    });
  } catch (error: any) {
    console.error('Auto-replication error:', error);
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 }
    );
  }
}
