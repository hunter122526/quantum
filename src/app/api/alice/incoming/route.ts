import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const FILE_PATH = path.join(process.cwd(), ".alice.incoming.json");

// Build a stable unique key for a trade
function makeKey(t: any) {
  return [
    t.account || "",
    t.symbol || t.instrument || t.scrip || "",
    t.price ?? t.fillPrice ?? "",
    t.quantity ?? t.qty ?? "",
    t.side || t.buySell || "",
    t.timestamp || ""
  ]
    .join("|")
    .replace(/\s+/g, "");
}

export async function GET() {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      return NextResponse.json({ trades: [] });
    }

    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw || "{}");
    
    // Handle both formats: array (legacy) and object with accountId keys (current)
    let trades: any[] = [];
    if (Array.isArray(parsed)) {
      trades = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      // Merge all trades from all accounts
      Object.values(parsed).forEach((accountTrades: any) => {
        if (Array.isArray(accountTrades)) {
          trades.push(...accountTrades);
        }
      });
    }

    // 🔥 Remove duplicates (latest occurrence wins)
    const map = new Map<string, any>();
    for (const t of trades) {
      const key = makeKey(t);
      map.set(key, t);
    }

    const uniqueTrades = Array.from(map.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({ trades: uniqueTrades });
  } catch (err: any) {
    console.error("Incoming read error:", err);
    return NextResponse.json({ trades: [] });
  }
}
