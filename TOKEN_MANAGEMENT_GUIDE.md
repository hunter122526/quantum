# Token Management & Copy Trading Setup

This guide explains how to set up the copy trading feature with follower account management.

## Overview

The system uses `x-qa-secret` to securely load follower accounts from `.alice.tokens.json` and enables copy trading functionality.

## Quick Start

### 1. Install Python SDK

```bash
pip install alice-blue
```

### 2. Fetch Follower Tokens

Use the provided Python script to fetch tokens from Alice Blue for each follower:

```bash
python scripts/fetch_tokens.py add <username> <password> <api_key> <api_secret>
```

**Example:**
```bash
python scripts/fetch_tokens.py add trader1@example.com mypassword abc123 xyz789
```

This script:
- Connects to Alice Blue using credentials
- Retrieves the session token
- Stores it in `.alice.tokens.json` (auto-created)
- Securely masks tokens when displayed

### 3. List All Stored Tokens

```bash
python scripts/fetch_tokens.py list
```

Output:
```
📋 Stored tokens in .alice.tokens.json:
  • trader1@example.com: abc1234567...8901
  • trader2@example.com: xyz9876543...2109
```

### 4. Configure Environment Variables

Set your secret in `.env.local`:

```bash
# Your secret for API authentication
QUANTUM_ALPHA_SECRET=your-strong-secret-here-change-this

# Token file location (optional)
ALICE_OAUTH_TOKENS_FILE=.alice.tokens.json
```

### 5. Load Accounts in Admin Panel

1. Go to `/admin` page (master account only)
2. Enter your `x-qa-secret` in the "API Authentication" section
3. Click "Load Accounts"
4. You should see all connected accounts listed

## How Copy Trading Works

### Flow Diagram

```
Master Account
    ↓
New Trade Placed
    ↓
Master trades displayed on Dashboard
    ↓
Click "Copy" button on trade
    ↓
Select follower accounts (checkboxes)
    ↓
Click "Copy to Selected"
    ↓
System validates each follower's risk config
    ↓
Calculates scaled quantities (lot multiplier, max qty, etc)
    ↓
Places orders on follower accounts via Alice Blue API
    ↓
Results shown: ✅ Success, ⚠️ Skipped, ❌ Failed
```

## File Structure

```
.alice.tokens.json          # Stores OAuth tokens for all followers
.alice.incoming.json        # Queues incoming master trades
scripts/
  └── fetch_tokens.py       # Python script to fetch tokens
src/
  └── app/
      ├── (main)/
      │   └── admin/
      │       └── page.tsx  # Admin panel UI
      ├── api/
      │   ├── admin/
      │   │   └── accounts/ # Load accounts from tokens file
      │   ├── trades/
      │   │   ├── replicate/    # Replicate to all followers
      │   │   └── copy-selected/ # Replicate to selected followers
      │   └── alice/
      │       └── poll/    # Fetch trades from master account
      └── (main)/dashboard/
          └── components/
              └── copy-trade-dialog.tsx # Follower selector UI
```

## API Endpoints

### Load Accounts
```bash
GET /api/admin/accounts
Header: x-qa-secret: your-secret

Response:
{
  "ok": true,
  "accounts": 2,
  "list": [
    { "userId": "trader1@example.com", "tokenMask": "abc1234567...8901" },
    { "userId": "trader2@example.com", "tokenMask": "xyz9876543...2109" }
  ]
}
```

### Trigger Trade Poll
```bash
POST /api/alice/poll
Content-Type: application/json

Response:
{
  "ok": true,
  "newTrades": 3,
  "message": "Polled 2 accounts"
}
```

### Copy Trade to Selected Followers
```bash
POST /api/trades/copy-selected
Content-Type: application/json
x-qa-secret: your-secret (optional)

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
  "follower_ids": ["trader1@example.com", "trader2@example.com"]
}

Response:
{
  "ok": true,
  "eventId": "EVENT456",
  "summary": {
    "total_followers": 2,
    "successful": 1,
    "failed": 0,
    "skipped": 1
  },
  "results": [
    {
      "follower_id": "trader1@example.com",
      "status": "SUCCESS",
      "follower_order_id": "ORD789"
    },
    {
      "follower_id": "trader2@example.com",
      "status": "SKIPPED",
      "reason": "Symbol SBIN not in allowed instruments"
    }
  ]
}
```

## Risk Controls

Each follower has risk configurations that are enforced:

```json
{
  "follower_id": "trader1@example.com",
  "risk_config": {
    "lot_multiplier": 0.5,           // Copy 50% of master quantity
    "max_quantity": 1000,             // Max 1000 qty per order
    "max_order_value": 500000,        // Max ₹5,00,000 per order
    "max_daily_loss": 50000,          // Max daily loss ₹50,000
    "allowed_instruments": ["SBIN", "INFY"],  // Only these symbols
    "allowed_product_types": ["MIS"],  // Only MIS orders
    "enabled": true                    // Is this follower active?
  }
}
```

## Troubleshooting

### "Unauthorized" when loading accounts
- Check that `x-qa-secret` matches `QUANTUM_ALPHA_SECRET` env var
- Verify case sensitivity: must be lowercase `x-qa-secret`

### No accounts showing
- Ensure `.alice.tokens.json` exists
- Run: `python scripts/fetch_tokens.py list` to verify tokens are stored
- Check file permissions

### Trades not polling
- Verify follower tokens are valid and not expired
- Check `/api/alice/poll` is being called
- Monitor logs for errors

### Copy trading fails for some followers
- Check follower's risk config restrictions
- Verify follower has "enabled: true"
- Check if quantity is sufficient after lot multiplier
- Review error message in results

## Advanced Setup

### Automated Polling

Set up a cron job to poll trades automatically:

```bash
# Every 30 seconds
*/1 * * * * for i in {1..3}; do curl -X POST http://localhost:3003/api/alice/poll; sleep 20; done
```

Or use Node.js scheduler:

```javascript
// scripts/poll-scheduler.js
setInterval(async () => {
  const res = await fetch('http://localhost:3003/api/alice/poll', { method: 'POST' });
  console.log('Poll:', await res.json());
}, 30000);
```

### Database Integration

For production, consider storing follower accounts in a database instead of `alice.tokens.json`:

```sql
CREATE TABLE follower_credentials (
  follower_id VARCHAR(255) PRIMARY KEY,
  client_id VARCHAR(255),
  api_key VARCHAR(255),
  access_token TEXT,
  broker_session_id VARCHAR(255),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE follower_risk_config (
  follower_id VARCHAR(255) PRIMARY KEY,
  lot_multiplier DECIMAL(5,2),
  max_quantity INT,
  max_order_value DECIMAL(12,2),
  max_daily_loss DECIMAL(12,2),
  allowed_instruments JSON,
  allowed_product_types JSON,
  allowed_order_types JSON,
  enabled BOOLEAN DEFAULT true,
  FOREIGN KEY (follower_id) REFERENCES follower_credentials(follower_id)
);
```

## License

MIT
