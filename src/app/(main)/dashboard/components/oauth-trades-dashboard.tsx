'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Trade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  executedAt: string;
  accountId?: string;
  orderStatus?: string;
}

export function OAuthTradesDashboard() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== 'trader') return;

    // Fetch trades for this account from API
    const fetchTrades = async () => {
      try {
        const response = await fetch(`/api/alice/trades?accountId=${encodeURIComponent(user.id)}`);
        const data = await response.json();
        if (data.trades && Array.isArray(data.trades)) {
          setTrades(data.trades);
        }
      } catch (error) {
        console.error('Failed to fetch trades:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();

    // Connect to SSE for live updates and only accept events for this account
    const eventSource = new EventSource('/api/alice/trades-stream');

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        // payload may be initial batch ({ type: 'initial', trades: [...] }) or single trade
        if (payload && payload.type === 'initial' && Array.isArray(payload.trades)) {
          const mine = payload.trades.filter((t: any) => String(t.account) === String(user.id));
          if (mine.length) setTrades(prev => [...mine, ...prev]);
          return;
        }

        const newTrade = payload;
        if (newTrade && String(newTrade.account) === String(user.id)) {
          setTrades(prev => [newTrade, ...prev]);
        }
      } catch (error) {
        console.error('Failed to parse trade update:', error);
      }
    };

    eventSource.onerror = () => {
      console.warn('SSE connection closed');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [user]);

  if (loading) {
    return <div className="text-center py-8">Loading trades...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Alice Blue Trades</h2>
        <p className="text-sm text-muted-foreground">
          Live trading activity from your Alice Blue account ({user?.id})
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order Book</CardTitle>
          <CardDescription>
            {trades.length} trade{trades.length !== 1 ? 's' : ''} loaded
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Executed At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No trades yet
                    </TableCell>
                  </TableRow>
                ) : (
                  trades.map((trade) => (
                    <TableRow key={trade.id} className="hover:bg-muted/50">
                      <TableCell className="font-semibold">{trade.symbol}</TableCell>
                      <TableCell>
                        <Badge variant={trade.side === 'BUY' ? 'default' : 'secondary'}>
                          {trade.side}
                        </Badge>
                      </TableCell>
                      <TableCell>{trade.quantity}</TableCell>
                      <TableCell className="font-mono">₹{trade.price.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{trade.orderStatus || 'EXECUTED'}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(trade.executedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
