"use client";

import React, { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy } from "lucide-react";
import { CopyTradeDialog } from "./copy-trade-dialog";

interface TradesTableProps {
  showAccount?: boolean;
}

type RemoteTrade = {
  id: string;
  timestamp: string;
  account: string;
  symbol: string;
  type: string;
  side: string;
  quantity: number;
  tradedQty: number;
  price: number;
  status: string;
};

export function TradesTable({ showAccount = true }: TradesTableProps) {
  const [loading, setLoading] = useState(true);
  const [masterTrades, setMasterTrades] = useState<RemoteTrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<RemoteTrade | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);

  const fetchTrades = async () => {
    setLoading(true);
    setError(null);

    try {
      // First trigger a poll to fetch latest trades from Alice Blue
      try {
        const pollRes = await fetch("/api/alice/poll", { method: "POST" });
        if (pollRes.ok) {
          const pollData = await pollRes.json();
          console.log('Trade poll completed:', pollData);
        }
      } catch (e) {
        console.warn('Trade poll failed:', e);
      }

      // Now fetch the incoming trades
      const tradeRes = await fetch("/api/alice/incoming");
      if (!tradeRes.ok) throw new Error(`Status ${tradeRes.status}`);

      const payload = await tradeRes.json().catch(() => ({}));
      const incoming = payload.trades ?? [];

      const mapped: RemoteTrade[] = incoming.map((t: any) => {
        const symbol = t.symbol || t.instrument || t.scrip || "";
        const quantity = Number(t.quantity ?? t.qty ?? 0);
        const price = Number(t.price ?? t.fillPrice ?? 0);
        const timestamp = t.timestamp || new Date().toISOString();
        const side = t.side || t.buySell || "Buy";

        const baseId =
          t.id ||
          `${t.account || "A"}-${symbol}-${price}-${quantity}-${side}-${timestamp}`;

        return {
          id: baseId.replace(/\s+/g, ""),
          timestamp,
          account: t.account || t.accountName || "Master",
          symbol,
          type: t.type || t.product || "Market",
          side,
          quantity,
          tradedQty: Number(t.tradedQty ?? t.filledQty ?? quantity),
          price,
          status: t.status || "Filled",
        };
      });

      // Remove duplicates
      const uniqueMap = new Map<string, RemoteTrade>();
      for (const trade of mapped) {
        uniqueMap.set(trade.id, trade);
      }

      const sorted = Array.from(uniqueMap.values()).sort(
        (a, b) =>
          new Date(b.timestamp).getTime() -
          new Date(a.timestamp).getTime()
      );

      setMasterTrades(sorted);
    } catch (e: any) {
      console.error("Failed to fetch trades", e);
      setError(e?.message ?? "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  // 🗑 CLEAR ALL TRADES
  const clearTrades = async () => {
    const confirmDelete = confirm("Are you sure you want to delete ALL trades?");
    if (!confirmDelete) return;

    try {
      const res = await fetch("/api/alice/clear", { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        setMasterTrades([]); // instant UI clear
      } else {
        alert("Failed to clear trades");
      }
    } catch (err) {
      console.error(err);
      alert("Server error while clearing trades");
    }
  };

  useEffect(() => {
    fetchTrades();

    // Auto-refresh trades every 30 seconds
    const interval = setInterval(() => {
      console.log('Auto-refreshing trades...');
      fetchTrades();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  function formatTime(ts: string) {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? "" : d.toLocaleTimeString();
  }

  return (
    <div className="w-full overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchTrades}>
            Refresh
          </Button>

          <Button variant="destructive" size="sm" onClick={clearTrades}>
            Clear All
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">
          Error loading trades: {error}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Instrument</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Traded Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-center">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {masterTrades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  No trades found.
                </TableCell>
              </TableRow>
            ) : (
              masterTrades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell>{formatTime(trade.timestamp)}</TableCell>
                  <TableCell>
                    <span
                      className={
                        trade.side === "Buy"
                          ? "inline-block bg-green-100 text-green-800 px-3 py-1 rounded text-sm"
                          : "inline-block bg-red-100 text-red-800 px-3 py-1 rounded text-sm"
                      }
                    >
                      {trade.side}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{trade.symbol}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {trade.type}
                  </TableCell>
                  <TableCell className="text-right">{trade.quantity}</TableCell>
                  <TableCell className="text-right">{trade.tradedQty}</TableCell>
                  <TableCell className="text-right">
                    ₹{trade.price.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedTrade(trade);
                        setCopyDialogOpen(true);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <CopyTradeDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        trade={selectedTrade}
      />
    </div>
  );
}
