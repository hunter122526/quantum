import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getTradesForAccount } from '@/lib/alice';
import { broadcastTrade } from '../trades-stream/route';

const TOKENS_FILE = process.env.ALICE_OAUTH_TOKENS_FILE || '.alice.tokens.json';
const INCOMING_FILE = process.env.QUANTUM_ALPHA_INCOMING_FILE || '.alice.incoming.json';
const MASTER_FILE = process.env.QUANTUM_MASTER_ACCOUNT_FILE || '.master.account';

function readMasterAccountId(): string | null {
  try {
    if (fs.existsSync(MASTER_FILE)) {
      const content = fs.readFileSync(MASTER_FILE, 'utf-8').trim();
      return content || null;
    }
  } catch (e) {
    console.warn('Failed reading master account file', e);
  }
  return null;
}

function readTokens(): Record<string, string> {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8') || '{}');
    }
  } catch (e) {
    console.error('Failed reading tokens file', e);
  }
  return {};
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

function writeIncoming(data: Record<string, any[]>) {
  try {
    fs.writeFileSync(INCOMING_FILE, JSON.stringify(data, null, 2), { encoding: 'utf-8', flag: 'w' });
  } catch (e) {
    console.error('Failed writing incoming file', e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const tokens = readTokens();
    const accountIds = Object.keys(tokens);
    if (accountIds.length === 0) {
      console.log('[POLL] No accounts with tokens to poll');
      return NextResponse.json({ ok: true, message: 'no accounts' });
    }

    // Prioritize master account polling
    const masterAccountId = readMasterAccountId();
    const sortedAccountIds = masterAccountId && accountIds.includes(masterAccountId)
      ? [masterAccountId, ...accountIds.filter(id => id !== masterAccountId)]
      : accountIds;

    const incoming = readIncoming();

    let totalNew = 0;
    for (const accId of sortedAccountIds) {
      try {
        console.log(`[POLL] Fetching trades for account: ${accId}`);
        const trades = await getTradesForAccount(accId);
        
        // Initialize account trades array if it doesn't exist
        if (!incoming[accId]) {
          incoming[accId] = [];
        }

        const existingIds = new Set((incoming[accId] || []).map(t => t.id));
        const newTrades = [];
        
        trades.forEach(t => {
          const id = t.id || `A-${Date.now()}-${Math.floor(Math.random()*100000)}`;
          if (!existingIds.has(id)) {
            const tr = { ...t, id, account: accId };
            incoming[accId].push(tr);
            newTrades.push(tr);
            totalNew++;
          }
        });

        console.log(`[POLL] Found ${trades.length} trades, ${newTrades.length} new for ${accId}`);

        // Broadcast new trades
        newTrades.forEach(nt => broadcastTrade({ ...nt, account: accId, isMaster: accId === masterAccountId }));
      } catch (e) {
        console.error(`[POLL] Failed fetching trades for ${accId}:`, e);
      }
    }

    writeIncoming(incoming);
    console.log(`[POLL] Total new trades: ${totalNew}`);
    return NextResponse.json({ ok: true, newTrades: totalNew, accountsPolled: sortedAccountIds.length });
  } catch (err: any) {
    console.error('[POLL] Error', err);
    return NextResponse.json({ ok: false, message: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}
