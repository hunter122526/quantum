import { Trade } from './data';
import crypto from 'crypto';
import fs from 'fs';
import { isSessionValid, getSessionInfo } from './session-manager';

export type AliceTrade = Trade;

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, backoff = 500) {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, backoff * Math.pow(2, attempt)));
      attempt++;
    }
  }
  throw new Error('Unreachable');
}

export function buildAuthHeaders(apiKey: string, apiSecret: string, method: string | undefined, url: string, body?: string, bearerToken?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Bearer token takes precedence
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
    return headers;
  }

  const authMethod = (method || 'headers').toLowerCase();

  if (authMethod === 'basic') {
    headers['Authorization'] = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
  } else if (authMethod === 'hmac') {
    // Generic HMAC implementation: provider specifics may vary — adapt to Alice Blue docs as necessary
    const ts = Math.floor(Date.now() / 1000).toString();
    const urlObj = new URL(url);
    const path = urlObj.pathname + (urlObj.search || '');
    const payload = body ?? '';
    const toSign = `${ts}:${path}:${payload}`;
    const signature = crypto.createHmac('sha256', apiSecret).update(toSign).digest('hex');
    headers['x-api-key'] = apiKey;
    headers['x-timestamp'] = ts;
    headers['x-signature'] = signature;
  } else {
    // default: custom headers
    headers['x-api-key'] = apiKey;
    headers['x-api-secret'] = apiSecret;
  }

  return headers;
}

export async function getMasterTrades(): Promise<AliceTrade[]> {
  const endpoint = process.env.ALICE_TRADES_ENDPOINT || process.env.ALICE_API_BASE_URL;
  const apiKey = process.env.ALICE_API_KEY;
  const apiSecret = process.env.ALICE_API_SECRET;

  // If endpoint is missing, fall back to seeded master trades
  if (!endpoint) {
    const { trades } = await import('./data');
    return trades.filter(t => t.account === 'Master');
  }

  // Prefer OAuth token if available (env or token file)
  const tokenFromEnv = process.env.ALICE_OAUTH_TOKEN;
  const tokenFile = process.env.ALICE_OAUTH_TOKEN_FILE || '.alice.token';
  let token: string | undefined = tokenFromEnv;

  if (!token && fs.existsSync(tokenFile)) {
    try {
      token = fs.readFileSync(tokenFile, 'utf-8').trim();
    } catch (e) {
      console.warn('Failed reading token file', tokenFile, e);
    }
  }

  // If we don't have API key/secret and we also don't have a token, fallback
  if (!apiKey && !token) {
    const { trades } = await import('./data');
    return trades.filter(t => t.account === 'Master');
  }

  const authMethod = process.env.ALICE_AUTH_METHOD;
  const headers = buildAuthHeaders(apiKey ?? '', apiSecret ?? '', authMethod, endpoint, undefined, token);

  const res = await fetchWithRetry(endpoint, { headers });
  const payload = await res.json().catch(() => ({}));
  const source = payload.trades || payload.data || payload || [];

  const mapped: AliceTrade[] = (Array.isArray(source) ? source : [])
    .map((d: any, idx: number) => ({
      id: d.id ?? d.tradeId ?? `A-${Date.now()}-${idx}`,
      timestamp: d.timestamp ?? d.time ?? new Date().toISOString(),
      account: process.env.ALICE_MASTER_ACCOUNT ?? 'Master',
      symbol: d.symbol ?? d.instrument ?? d.scrip ?? d.ticker ?? '',
      type: d.type ?? 'Market',
      side: d.side ?? d.buySell ?? (d.transactionType === 'SELL' ? 'Sell' : 'Buy'),
      quantity: Number(d.quantity ?? d.qty ?? d.quantityFilled ?? 0),
      price: Number(d.price ?? d.rate ?? d.fillPrice ?? 0),
      status: d.status ?? 'Filled',
    }));

  return mapped;
}

const TOKENS_FILE = process.env.ALICE_OAUTH_TOKENS_FILE || '.alice.tokens.json';

function readTokensFile(): Record<string, string> {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const raw = fs.readFileSync(TOKENS_FILE, 'utf-8');
      return JSON.parse(raw || '{}');
    }
  } catch (e) {
    console.warn('Failed reading tokens file', TOKENS_FILE, e);
  }
  return {};
}

function writeTokensFile(tokens: Record<string, string>) {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { encoding: 'utf-8', flag: 'w' });
  } catch (e) {
    console.error('Failed writing tokens file', TOKENS_FILE, e);
  }
}

export function saveAccountToken(accountId: string, token: string) {
  if (!accountId) return;
  const tokens = readTokensFile();
  tokens[accountId] = token;
  writeTokensFile(tokens);
}

export function getAccountToken(accountId: string): string | undefined {
  if (!accountId) return undefined;
  const tokens = readTokensFile();
  return tokens[accountId];
}

export async function getTradesForAccount(accountId?: string): Promise<AliceTrade[]> {
  const endpoint = process.env.ALICE_TRADES_ENDPOINT || process.env.ALICE_API_BASE_URL;
  const apiKey = process.env.ALICE_API_KEY;
  const apiSecret = process.env.ALICE_API_SECRET;

  // First, check if we have an OAuth token for this account
  const token = getAccountToken(accountId || process.env.ALICE_MASTER_ACCOUNT || 'Master');

  // Priority 1: If we have an OAuth token, fetch from Alice Blue's Trade Book API
  if (token) {
    // Check if session is still valid
    const sessionValid = isSessionValid(accountId || process.env.ALICE_MASTER_ACCOUNT || 'Master');
    if (!sessionValid) {
      const sessionInfo = getSessionInfo(accountId || process.env.ALICE_MASTER_ACCOUNT || 'Master');
      console.warn(`[TRADES] Session for ${accountId || 'Master'} is invalid/expired`, sessionInfo);
      // Fall through to alternative methods instead of failing
    } else {
      try {
        const tradeBookUrl = 'https://ant.aliceblueonline.com/open-api/od/v1/trades';
        console.log(`[TRADES] Fetching from Alice Blue Trade Book for account: ${accountId || 'Master'}`);
        
        const res = await fetchWithRetry(tradeBookUrl, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          }
        });

        const payload = await res.json().catch(() => ({}));
        const source = payload.trades || payload.data || payload || [];

        const mapped: AliceTrade[] = (Array.isArray(source) ? source : [])
          .map((d: any, idx: number) => ({
            id: d.id ?? d.tradeId ?? `A-${Date.now()}-${idx}`,
            timestamp: d.timestamp ?? d.time ?? new Date().toISOString(),
            account: accountId ?? (process.env.ALICE_MASTER_ACCOUNT ?? 'Master'),
            symbol: d.symbol ?? d.instrument ?? d.scrip ?? d.ticker ?? '',
            type: d.type ?? 'Market',
            side: d.side ?? d.buySell ?? (d.transactionType === 'SELL' ? 'Sell' : 'Buy'),
            quantity: Number(d.quantity ?? d.qty ?? d.quantityFilled ?? 0),
            price: Number(d.price ?? d.rate ?? d.fillPrice ?? 0),
            status: d.status ?? 'Filled',
          }));

        console.log(`[TRADES] Successfully fetched ${mapped.length} trades from Alice Blue`);
        return mapped;
      } catch (e) {
        console.error(`[TRADES] Failed to fetch from Alice Blue Trade Book:`, e);
        // Fall through to alternative methods
      }
    }
  }

  // Priority 2: If no endpoint configured and no OAuth token, fallback to seeded data
  if (!endpoint && !token) {
    console.log(`[TRADES] No endpoint or OAuth token, using seeded data for account: ${accountId || 'Master'}`);
    const { trades } = await import('./data');
    return trades.filter(t => !accountId || t.account === (accountId || 'Master'));
  }

  // Priority 3: Try the configured TRADES_ENDPOINT or API_BASE_URL with API credentials
  if (endpoint && (apiKey || token)) {
    try {
      console.log(`[TRADES] Fetching from configured endpoint: ${endpoint}`);
      const authMethod = process.env.ALICE_AUTH_METHOD;
      const headers = buildAuthHeaders(apiKey ?? '', apiSecret ?? '', authMethod, endpoint, undefined, token);

      const res = await fetchWithRetry(endpoint, { headers });
      const payload = await res.json().catch(() => ({}));
      const source = payload.trades || payload.data || payload || [];

      const mapped: AliceTrade[] = (Array.isArray(source) ? source : [])
        .map((d: any, idx: number) => ({
          id: d.id ?? d.tradeId ?? `A-${Date.now()}-${idx}`,
          timestamp: d.timestamp ?? d.time ?? new Date().toISOString(),
          account: accountId ?? (process.env.ALICE_MASTER_ACCOUNT ?? 'Master'),
          symbol: d.symbol ?? d.instrument ?? d.scrip ?? d.ticker ?? '',
          type: d.type ?? 'Market',
          side: d.side ?? d.buySell ?? (d.transactionType === 'SELL' ? 'Sell' : 'Buy'),
          quantity: Number(d.quantity ?? d.qty ?? d.quantityFilled ?? 0),
          price: Number(d.price ?? d.rate ?? d.fillPrice ?? 0),
          status: d.status ?? 'Filled',
        }));

      console.log(`[TRADES] Successfully fetched ${mapped.length} trades from configured endpoint`);
      return mapped;
    } catch (e) {
      console.error(`[TRADES] Failed to fetch from configured endpoint:`, e);
      // Fall through to seeded data
    }
  }

  // Priority 4: Fallback to seeded data
  console.log(`[TRADES] Falling back to seeded data for account: ${accountId || 'Master'}`);
  const { trades } = await import('./data');
  return trades.filter(t => !accountId || t.account === (accountId || 'Master'));
}

export async function pushOrderToAccount(accountId: string, order: any, follower?: { apiKey?: string; clientId?: string; sessionToken?: string }) {
  const orderEndpoint = process.env.ALICE_ORDER_ENDPOINT || (process.env.ALICE_API_BASE_URL ? `${process.env.ALICE_API_BASE_URL.replace(/\/$/, '')}/orders` : undefined);

  if (!orderEndpoint) {
    throw new Error('ALICE_ORDER_ENDPOINT not configured');
  }

  const token = follower?.sessionToken || getAccountToken(accountId);
  const apiKey = follower?.apiKey || process.env.ALICE_API_KEY || '';
  const apiSecret = follower?.clientId || process.env.ALICE_API_SECRET || '';
  const authMethod = process.env.ALICE_AUTH_METHOD;

  const headers = buildAuthHeaders(apiKey, apiSecret, authMethod, orderEndpoint, undefined, token);

  const body = {
    symbol: order.symbol,
    transactionType: (order.side || 'Buy').toString().toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    quantity: Number(order.qty || order.quantity || 0),
    orderType: (order.type || 'Market').toString().toUpperCase(),
    price: Number(order.price || 0),
    clientOrderId: order.id,
  };

  const res = await fetchWithRetry(orderEndpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  const parsed = await res.json().catch(() => ({}));
  return parsed;
}
