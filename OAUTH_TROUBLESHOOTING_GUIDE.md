# OAuth Aliceblue Master Connection - Troubleshooting Guide

## Problem Summary

When connecting with OAuth to the master Aliceblue account, the connection was not properly established and trades from the Aliceblue tradebook were not being fetched to the dashboard.

## Root Causes Identified & Fixed

### 1. **Incoming Endpoint Data Structure Mismatch** ✅ FIXED
- **Problem**: The `/api/alice/poll` endpoint writes trades as `{ [accountId]: trades[] }`, but `/api/alice/incoming` was reading data as a simple array
- **Fix**: Updated the incoming endpoint to handle both formats (legacy array and current object structure)
- **File**: `src/app/api/alice/incoming/route.ts`

### 2. **Improper Trade Fetching Priority** ✅ FIXED  
- **Problem**: `getTradesForAccount()` wasn't prioritizing OAuth token-based fetching from Alice Blue's official Trade Book API
- **Fix**: Updated the function to prioritize Alice Blue's Trade Book API when OAuth token is available:
  1. First attempts to fetch from `https://ant.aliceblueonline.com/open-api/od/v1/trades` with Bearer token
  2. Falls back to configured ALICE_TRADES_ENDPOINT with API credentials
  3. Finally falls back to seeded data if neither works
- **File**: `src/lib/alice.ts`

### 3. **Missing Auto-Refresh Mechanism** ✅ FIXED
- **Problem**: Trades were only fetched once on page load, with no continuous polling
- **Fix**: 
  - Updated TradesTable component to trigger poll endpoint before fetching incoming trades
  - Added 30-second auto-refresh interval to keep trades synchronized
  - Poll endpoint now properly handles master account prioritization
- **File**: `src/app/(main)/dashboard/components/trades-table.tsx`

### 4. **Incomplete Poll Logging** ✅ FIXED
- **Problem**: Difficult to debug which accounts were being polled or if new trades were found
- **Fix**: Added detailed console logging at all stages of polling:
  - Account polling start/end
  - Trade count before/after fetch
  - New trades added
  - Success/failure at each step
- **File**: `src/app/api/alice/poll/route.ts`

## OAuth Connection Flow

The system supports **vendor OAuth flow** (via Alice Blue's hosted OAuth):

```
1. User clicks "Connect Alice Blue" button
   ↓
2. /api/alice/oauth/vendor/start
   - Sets alice_oauth_is_master cookie
   - Redirects to: https://ant.aliceblueonline.com/?appcode={ALICE_APP_CODE}
   ↓
3. Alice Blue OAuth - User authorizes
   ↓
4. Alice Blue redirects back to /aliceblue/callback with:
   - authCode (OAuth authorization code)
   - userId (Alice Blue user ID)
   ↓
5. /aliceblue/callback
   - Validates authCode with Alice Blue's API
   - Receives userSession token
   - Saves token via saveAccountToken(userId, userSession)
   - Saves userId as master account
   - Triggers /api/alice/poll to fetch initial trades
   - Redirects to /dashboard with user in cookie
   ↓
6. Dashboard loads
   - TradesTable component calls /api/alice/poll again
   - Poll fetches trades from Alice Blue using saved OAuth token
   - Trades displayed in Master Trade Book
```

## Environment Variables Required

```env
# OAuth Configuration
ALICE_APP_CODE=your_alice_blue_app_code
ALICE_API_SECRET=your_alice_blue_api_secret
ALICE_APP_ORIGIN=https://yourdomain.com (optional, defaults to origin)

# Optional: For troubleshooting
NODE_ENV=development  # Enables verbose logging
```

## Testing the OAuth Connection

### Step 1: Verify Configuration
```bash
# Check if ALICE_APP_CODE is set
echo $ALICE_APP_CODE
```

### Step 2: Test OAuth Flow
1. Open dashboard
2. Click "Connect Alice Blue Master Account"
3. Should redirect to Alice Blue OAuth
4. After authorization, should redirect back to dashboard

### Step 3: Verify Token Saved
```bash
# Check if token file exists and has content
cat .alice.tokens.json
# Should show: { "userId": "sessionToken..." }
```

### Step 4: Test Trade Fetching
```bash
# Manually trigger poll
curl -X POST http://localhost:3000/api/alice/poll

# Should return:
# { "ok": true, "newTrades": N, "accountsPolled": 1 }
```

### Step 5: Check Incoming Trades
```bash
# Get stored trades
curl http://localhost:3000/api/alice/incoming

# Should return trades array with master trades
```

## Common Issues & Solutions

### Issue 1: "Missing authCode or userId in callback"
**Cause**: Alice Blue OAuth is not properly redirecting back
**Solution**:
1. Verify ALICE_APP_CODE is correct
2. Check cloud.aliceblueonline.com for app configuration
3. Ensure redirect URI matches your domain

### Issue 2: "No userSession in response" from callback
**Cause**: Alice Blue API validation failed
**Solution**:
1. Verify ALICE_API_SECRET is correct
2. Check if checksum calculation is correct in `/aliceblue/callback`
3. Verify your Alice Blue account has API access enabled

### Issue 3: "No OAuth token found for this account" when fetching trades
**Cause**: Token was not saved during OAuth callback
**Solution**:
1. Check browser console logs during OAuth flow
2. Verify .alice.tokens.json has content
3. Ensure /aliceblue/callback completed successfully

### Issue 4: Dashboard shows "No trades yet" even after connecting
**Cause**: Poll endpoint is not finding any trades
**Solution**:
1. Check server logs for poll errors: `[POLL]` prefix
2. Verify master account has executed trades in Alice Blue
3. Try manual poll: `curl -X POST http://localhost:3000/api/alice/poll`
4. Check /api/alice/incoming response

### Issue 5: Trades stop updating after initial load
**Cause**: Auto-refresh interval was disabled or failed
**Solution**:
1. Check browser console for errors (should see "Auto-refreshing trades..." every 30 seconds)
2. Manually click "Refresh" button on Master Trade Book
3. Check if OAuth token expired (24 hour max age)

## Debug Commands

### View all console logs
```bash
# Server-side logs will show [POLL], [TRADES], [OAUTH-CALLBACK] prefixes
# Look for these patterns to track the flow
```

### View stored tokens
```bash
cat .alice.tokens.json
```

### View stored trades
```bash
cat .alice.incoming.json
```

### Trigger manual poll
```bash
curl -X POST http://localhost:3000/api/alice/poll \
  -H "Content-Type: application/json"
```

### Clear all trades (for testing)
```bash
curl -X DELETE http://localhost:3000/api/alice/clear
```

## Performance Notes

- **Polling Interval**: 30 seconds (adjustable in trades-table.tsx)
- **OAuth Token Lifetime**: 24 hours (set in /aliceblue/callback)
- **Trade Deduplication**: Automatic based on account+symbol+price+quantity+side+timestamp
- **Master Account Priority**: Master account is polled before follower accounts

## Next Steps

1. **Enable continuous polling in background**: Create a cron job that calls `/api/alice/poll` every minute
2. **Add webhook support**: Listen for trade events from Alice Blue instead of polling
3. **Add token refresh**: Implement automatic OAuth token refresh before expiry
4. **Add retry mechanism**: Implement exponential backoff for API failures
5. **Add trade webhooks**: Subscribe to real-time trade events from Alice Blue
