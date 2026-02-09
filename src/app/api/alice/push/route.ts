import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const FILE_PATH = path.join(process.cwd(), ".alice.incoming.json");

type Trade = {
  id: string;
  timestamp?: number;
  symbol?: string;
  side?: string;
  qty?: number;
  price?: number;
  account?: string;
};

export async function POST(req: NextRequest) {
  try {
    // 🔐 Secret check
    const secret = req.headers.get("x-qa-secret");
    if (!process.env.QUANTUM_ALPHA_SECRET || secret !== process.env.QUANTUM_ALPHA_SECRET) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { accountId, trades } = body;

    if (!accountId || !Array.isArray(trades)) {
      return NextResponse.json({ ok: false, message: "Invalid payload" }, { status: 400 });
    }

    // 📂 Read existing trades safely
    let existing: Trade[] = [];

    if (fs.existsSync(FILE_PATH)) {
      try {
        const raw = fs.readFileSync(FILE_PATH, "utf-8");
        const parsed = JSON.parse(raw || "[]");

        // Support BOTH formats:
        // 1) []
        // 2) { trades: [] }
        if (Array.isArray(parsed)) {
          existing = parsed;
        } else if (Array.isArray(parsed.trades)) {
          existing = parsed.trades;
        }
      } catch (e) {
        console.warn("Corrupt trade file. Resetting.");
        existing = [];
      }
    }

    // 🧠 Dedupe using Map
    const tradeMap = new Map<string, Trade>();

    // Load old trades first
    for (const t of existing) {
      if (t?.id) {
        tradeMap.set(t.id, t);
      }
    }

    // Add new trades (overwrite if duplicate id)
    for (const t of trades) {
      if (!t?.id) continue;

      tradeMap.set(t.id, {
        ...t,
        account: accountId,
        timestamp: t.timestamp || Date.now(),
      });
    }

    const mergedTrades = Array.from(tradeMap.values());

    // 🧹 Optional: keep only last 5000 trades (prevents file from growing forever)
    const trimmedTrades =
      mergedTrades.length > 5000
        ? mergedTrades.slice(mergedTrades.length - 5000)
        : mergedTrades;

    fs.writeFileSync(FILE_PATH, JSON.stringify(trimmedTrades, null, 2));

    return NextResponse.json({
      ok: true,
      received: trades.length,
      stored: trimmedTrades.length,
    });
  } catch (err: any) {
    console.error("Push error:", err);
    return NextResponse.json(
      { ok: false, message: "Server error", error: err.message },
      { status: 500 }
    );
  }
}
