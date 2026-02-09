# Master Copy Trading Flow Guide

Complete step-by-step guide for the copy trading system with automatic token management.

## 🎯 Overview

```
Master Account
    ↓
Click "Connect to Alice Blue"
    ↓
OAuth Login (automatic)
    ↓
Token Stored Automatically
    ↓
Dashboard shows "Connected" status
    ↓
Master Trades Loaded Automatically
    ↓
Master selects follower accounts
    ↓
Click "Copy" on trade
    ↓
Followers receive orders on Alice Blue
```

---

## Step 1: Master Connects to Alice Blue

### On Dashboard
1. Go to `/dashboard` (master account)
2. You'll see **"Master Account Not Connected"** card (yellow)
3. Click **"Connect to Alice Blue"** button

### What Happens
- Redirects to Alice Blue OAuth login
- You enter your Alice Blue credentials
- Alice Blue authorizes the app
- Redirects back to dashboard with token
- **Token is automatically saved** to `.alice.tokens.json`
- **Master account ID is saved** to `.master.account`
- Dashboard updates to show **"Master Account Connected"** (green)

### System Files Created
```
.master.account          # Contains your user ID (e.g., "trader@example.com")
.alice.tokens.json       # Contains your token (e.g., {"trader@example.com": "token123..."})
```

---

## Step 2: Master Trades Load Automatically

### Automatic Polling
Once connected, the system automatically:
1. **Polls your master trades** from Alice Blue API every 30 seconds (or on-demand)
2. **Stores them** in `.alice.incoming.json`
3. **Broadcasts to dashboard** via SSE (Server-Sent Events)
4. **Displays on Trades Table** in real-time

### Manual Polling
Go to **Admin Panel** (`/admin`):
1. Enter your `x-qa-secret` (from env vars)
2. Click "Load Accounts" → Shows your master account as connected
3. Click "Trigger Poll Now" → Fetches trades immediately

---

## Step 3: Master Adds Follower Accounts

Followers can connect in two ways:

### Option A: Follower Self-Registration (Recommended)
1. Follower also clicks "Connect to Alice Blue" on their dashboard
2. Their token is automatically saved
3. Shows as active in Admin Panel

### Option B: Manual Token via Python SDK
```bash
# Admin runs Python script
python scripts/fetch_tokens.py add follower@example.com password api_key api_secret
```

**File updated:**
```json
.alice.tokens.json
{
  "trader@example.com": "master_token...",
  "follower1@example.com": "follower1_token...",
  "follower2@example.com": "follower2_token..."
}
```

---

## Step 4: Master Copies Trades to Followers

### On Dashboard - Trades Table

1. **View Master Trades**
   - Dashboard shows all trades from master account
   - Marked as "Master" trades

2. **Click "Copy" Button**
   - Opens follower selector dialog
   - Shows all connected followers with checkboxes
   - Shows each follower's lot multiplier (e.g., 0.5x, 1x)

3. **Select Followers**
   - Check boxes next to followers you want to copy to
   - Or click "Select All" to copy to all followers

4. **Click "Copy to Selected"**
   - System validates each follower's risk config
   - Calculates scaled quantities:
     - Master qty: 100
     - Follower A (0.5x multiplier): 50
     - Follower B (1.0x multiplier): 100
   - Places orders on each follower's Alice Blue account
   - Shows results:
     - ✅ Success: Order placed
     - ⚠️ Skipped: Risk limit exceeded
     - ❌ Failed: API error

---

## System Architecture

### Files & Data Flow

```
Master OAuth Login
        ↓
[OAuth Vendor Callback] (/api/alice/oauth/vendor/callback)
        ↓
Save Token → .alice.tokens.json
Save Master ID → .master.account
        ↓
Dashboard updates [Master Connection Status]
        ↓
User clicks "Trigger Poll"
        ↓
[Poll Endpoint] (/api/alice/poll)
        ↓
Fetch trades from master account
        ↓
Store in → .alice.incoming.json
        ↓
Broadcast via SSE → Dashboard [Trades Table]
        ↓
User clicks "Copy" on trade
        ↓
[Copy Dialog] (follower-selector)
        ↓
User selects followers & clicks "Copy to Selected"
        ↓
[Copy-Selected API] (/api/trades/copy-selected)
        ↓
For each follower:
  1. Load their token from .alice.tokens.json
  2. Validate risk config
  3. Calculate scaled quantity
  4. Place order via Alice Blue API
        ↓
Return results → Show toast notifications
```

---

## API Endpoints

### 1. Master Status Check
```bash
GET /api/master/status

Response:
{
  "ok": true,
  "master": {
    "userId": "trader@example.com",
    "tokenMask": "abc1234567...8901"
  }
}

# When not connected:
{
  "ok": true,
  "master": null
}
```

### 2. Master Disconnect
```bash
POST /api/master/disconnect

Response:
{
  "ok": true,
  "message": "Master account disconnected"
}
```

### 3. Check Master/Account Status (Admin)
```bash
GET /api/admin/accounts
Header: x-qa-secret: your-secret

Response:
{
  "ok": true,
  "accounts": 2,
  "list": [
    { "userId": "trader@example.com", "tokenMask": "abc..." },
    { "userId": "follower1@example.com", "tokenMask": "xyz..." }
  ]
}
```

### 4. Trigger Poll
```bash
POST /api/alice/poll

Response:
{
  "ok": true,
  "newTrades": 3,
  "message": "Polled 2 accounts"
}
```

### 5. Copy Trade to Selected Followers
```bash
POST /api/trades/copy-selected
Content-Type: application/json

Body:
{
  "trade": {
    "id": "TRADE123",
    "symbol": "SBIN",
    "side": "BUY",
    "quantity": 100,
    "price": 500,
    "order_type": "MARKET",
    "product_type": "MIS"
  },
  "follower_ids": ["follower1@example.com", "follower2@example.com"]
}

Response:
{
  "ok": true,
  "summary": {
    "total_followers": 2,
    "successful": 1,
    "failed": 0,
    "skipped": 1
  },
  "results": [
    {
      "follower_id": "follower1@example.com",
      "status": "SUCCESS",
      "follower_order_id": "ORD789"
    },
    {
      "follower_id": "follower2@example.com",
      "status": "SKIPPED",
      "reason": "Symbol SBIN not in allowed instruments"
    }
  ]
}
```

---

## Risk Controls

Each follower's risk configuration is enforced:

```json
{
  "follower_id": "follower@example.com",
  "risk_config": {
    "lot_multiplier": 0.5,              // Trade 50% of master qty
    "max_quantity": 1000,                // Max 1000 qty per order
    "max_order_value": 500000,           // Max ₹5,00,000 per order
    "max_daily_loss": 50000,             // Max daily loss ₹50,000
    "allowed_instruments": ["SBIN"],     // Only these symbols allowed
    "allowed_product_types": ["MIS"],    // Only MIS/CNC allowed
    "enabled": true                      // Is follower active?
  }
}
```

**When copying a trade:**
- ✅ Symbol in allowed list → Copy
- ❌ Symbol NOT in allowed list → Skip with reason
- ❌ Max quantity exceeded → Cap to max_quantity
- ❌ Order value too high → Skip with reason
- ❌ Follower disabled → Skip

---

## Environment Variables

```bash
# OAuth Configuration
ALICE_CLIENT_ID=your_client_id
ALICE_CLIENT_SECRET=your_client_secret
ALICE_APP_CODE=your_app_code
ALICE_REDIRECT_URI=http://localhost:3003/aliceblue/callback
ALICE_APP_ORIGIN=http://localhost:3003

# API Secret (for admin operations)
QUANTUM_ALPHA_SECRET=your-strong-secret-here

# File Locations
ALICE_OAUTH_TOKENS_FILE=.alice.tokens.json
QUANTUM_MASTER_ACCOUNT_FILE=.master.account
QUANTUM_ALPHA_INCOMING_FILE=.alice.incoming.json
```

---

## Troubleshooting

### Master "Connect to Alice Blue" redirects to login repeatedly
**Cause:** Alice Blue OAuth configuration incorrect  
**Fix:** 
- Check `ALICE_APP_CODE` is correct
- Verify `ALICE_APP_ORIGIN` matches your domain
- Ensure Alice Blue account has vendor access

### Master trades not showing on dashboard
**Cause:** Polling not fetching trades  
**Fix:**
- Check `.alice.tokens.json` has master token
- Check `.master.account` has master ID
- Go to Admin and click "Trigger Poll Now"
- Check browser console for errors

### Copy trading fails for some followers
**Cause:** Risk config restrictions  
**Fix:**
- Go to `/configuration` → Manage Followers
- Check follower's risk limits
- Verify symbol is in allowed_instruments
- Check max_quantity and max_order_value

### "Unauthorized" in Admin Panel
**Cause:** x-qa-secret doesn't match  
**Fix:**
- Get secret from `.env.local` (`QUANTUM_ALPHA_SECRET`)
- Paste exact secret in Admin Panel
- Verify case sensitivity

---

## Complete User Journey Example

```
Day 1: Setup Master Account
  09:00 - Master logs into website
  09:05 - Clicks "Connect to Alice Blue"
  09:10 - OAuth redirect to Alice Blue login
  09:15 - Authorizes app, redirected back
  09:20 - Token saved to .alice.tokens.json
  09:25 - Dashboard shows "Master Account Connected" ✅

Day 2: Followers Connect
  10:00 - Follower 1 logs in, clicks "Connect to Alice Blue"
  10:05 - Follower 2 does the same
  10:10 - Admin verifies both in `/admin` panel ✅

Day 3: Copy Trading
  14:00 - Master places trade: BUY SBIN 100 @ ₹500
  14:05 - Trade appears on dashboard
  14:10 - Master clicks "Copy" button
  14:12 - Selects Follower 1 & Follower 2
  14:15 - Clicks "Copy to Selected"
  14:20 - Results:
         - Follower 1: ✅ 50 qty (0.5x multiplier)
         - Follower 2: ✅ 100 qty (1.0x multiplier)
  14:25 - Followers receive push notifications on Alice Blue
  14:30 - Master exits trades, followers copy the exit
```

---

## Next Steps

1. ✅ Master connects to Alice Blue
2. ✅ Followers connect or are added manually
3. ✅ Trades copy automatically with risk limits
4. 📊 Monitor P&L in shared analytics dashboard (future)
5. 🔄 Set up automated polling every N seconds (optional)

---

## Support

For issues, check:
- Console logs: `npm run dev` output
- Database logs: `.alice.tokens.json`, `.master.account`
- Admin panel: `/admin` for account status
- Trades page: `/dashboard` for live trades
