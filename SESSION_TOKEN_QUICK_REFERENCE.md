# Session Token Management - Quick Reference

## When Does a Master Need to Change/Refresh Their Session Token?

### Scenario 1: Token Expires (24 hours)
- **Problem**: Master's OAuth token expires after 24 hours
- **Solution**: Call `/api/auth/session/refresh` with new token
- **No re-login needed**: Master stays logged in

### Scenario 2: Master Logs Out
- **What happens**: Session marked as `isValid: false`
- **Can they log back in?**: Yes, either via:
  - OAuth flow (gets new token) → New session created
  - Or admin manually refreshes token → Reuses old session with new token
- **Trades stop working?**: Yes, until new session is active

### Scenario 3: Master Wants to Re-authenticate
- **Action**: Call `/api/auth/logout`, then OAuth flow
- **Result**: Old session invalidated, new session created
- **Token changes**: Yes, completely new token from Alice Blue

## Complete Workflow: Master OAuth → Trades → Logout → Re-Login

```
┌─────────────────────────────────────────────────────────────────┐
│ MASTER AUTH FLOW                                                  │
└─────────────────────────────────────────────────────────────────┘

STEP 1: Master clicks "Connect Alice Blue"
  ↓
  /api/alice/oauth/vendor/start
  - Redirects to Alice Blue OAuth
  - Sets cookies for this flow
  ↓
STEP 2: Master authorizes on Alice Blue
  ↓
STEP 3: Alice Blue redirects to /aliceblue/callback
  - authCode + userId returned
  - Validates with Alice Blue
  - Gets userSession token
  ↓
STEP 4: Token saved with metadata
  saveSession(userId, userSession, {
    expiresIn: 86400,        // 24 hours
    source: 'oauth-vendor'
  })
  ↓
  Storage (.alice.sessions.json):
  {
    "userId": {
      "accountId": "userId",
      "token": "abc123...",
      "issuedAt": 1708156800000,
      "expiresAt": 1708243200000,
      "source": "oauth-vendor",
      "isValid": true
    }
  }
  ↓
STEP 5: Poll trades immediately
  /api/alice/poll
  - Fetches trades from Alice Blue
  - Stores in .alice.incoming.json
  ↓
STEP 6: Dashboard shows trades
  /api/alice/incoming
  - Returns stored trades from poll
  ↓
MASTER DASHBOARD IS READY
```

## Token Refresh Scenarios

### Scenario A: Token Expires (Natural Expiry)

```
24 Hours Later:
  ↓
System detects token expired:
  isSessionValid(userId) → false
  ↓
Options for master:
  
  Option 1: Re-authenticate
    /api/auth/logout
    → OAuth flow again
    → New session created
  
  Option 2: Admin refresh token
    /api/auth/session/refresh
    {
      accountId: "userId",
      newToken: "newTokenFromAliceBlue"
    }
    → Session updated with new token
    ↓
Trades resume working
```

### Scenario B: Master Logs Out Manually

```
Master clicks "Logout"
  ↓
/api/auth/logout
  - Session marked isValid: false
  - Auth cookie cleared
  ↓
Master tries to fetch trades:
  isSessionValid(userId) → false
  ↓
ERROR: "Session expired or invalid"
  ↓
Master must:
  Option 1: Re-login via OAuth (new session)
  Option 2: Admin refreshes token, master logs in normally
```

### Scenario C: Session Expires, Master Wants to Continue

```
GET /api/auth/session/info?accountId=userId

Response:
{
  "ok": true,
  "session": {
    "isExpired": true,
    "timeRemaining": 0,
    "isValid": false,
    "expiresAt": "2024-02-18T12:00:00Z"
  }
}
  ↓
Admin/Auto system refreshes:

POST /api/auth/session/refresh
{
  "accountId": "userId",
  "newToken": "freshTokenFromAliceBlueAPI",
  "expiresIn": 86400
}

Response:
{
  "ok": true,
  "session": {
    "expiresAt": "2024-02-19T12:00:00Z",
    "isValid": true
  }
}
  ↓
Trades resume immediately (no master action needed)
```

### Scenario D: Token Refresh Flow (If Alice Blue Supports It)

```
Short-lived: Access Token (1 hour)
Long-lived: Refresh Token (30 days)

Initial OAuth:
  saveSession(userId, accessToken, {
    refreshToken: longLivedRefreshToken,
    expiresIn: 3600  // 1 hour
  })

After 50 minutes (Auto-refresh):
  New accessToken = exchangeRefreshToken(refreshToken)
  saveSession(userId, newAccessToken, {
    refreshToken: longLivedRefreshToken,
    expiresIn: 3600
  })

Benefit: No master action needed, system refreshes automatically
```

## Command Reference

### Check Current Session Status
```bash
curl http://localhost:3000/api/auth/session/info \
  -H "Content-Type: application/json" \
  -d '{"accountId": "userId123"}'
```

### Verify Session Is Valid
```bash
curl -X POST http://localhost:3000/api/auth/session/verify \
  -H "Content-Type: application/json" \
  -d '{"accountId": "userId123"}'
```

### Refresh Token (Master's Token Expired)
```bash
curl -X POST http://localhost:3000/api/auth/session/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "userId123",
    "newToken": "NEW_TOKEN_FROM_ALICE_BLUE",
    "expiresIn": 86400
  }'
```

### Invalidate Session (Force Re-login)
```bash
curl -X POST http://localhost:3000/api/auth/session/delete \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "userId123",
    "action": "invalidate"
  }'
```

### Delete Session Completely
```bash
curl -X POST http://localhost:3000/api/auth/session/delete \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "userId123",
    "action": "delete"
  }'
```

### Logout Master
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Cookie: alice_user=..."
```

## Session Storage

Sessions are stored in `.alice.sessions.json`:
```json
{
  "accountId1": {
    "accountId": "accountId1",
    "token": "sessionToken...",
    "issuedAt": 1708156800000,
    "expiresAt": 1708243200000,
    "refreshToken": null,
    "source": "oauth-vendor",
    "isValid": true
  }
}
```

## Session Fields Explained

| Field | Meaning | Example |
|-------|---------|---------|
| `accountId` | Master's Alice Blue user ID | `"user_123"` |
| `token` | OAuth session token | `"abc123xyz789..."` |
| `issuedAt` | When token was created (ms) | `1708156800000` |
| `expiresAt` | When token expires (ms) | `1708243200000` |
| `refreshToken` | Refresh token (if provided) | `"refresh_xyz"` or `null` |
| `source` | How token was obtained | `"oauth-vendor"` |
| `isValid` | Is session still valid? | `true` / `false` |

## Automatic Session Cleanup

The system automatically:
- Cleans up expired sessions when accessed
- Marks sessions invalid on logout
- Warns when tokens expire soon (< 1 hour)
- Validates before using for API calls

## Database Schema (Future)

When we add database support, add this table:

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  account_id VARCHAR(255) NOT NULL,
  token TEXT NOT NULL,
  issued_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  refresh_token TEXT,
  source VARCHAR(50),
  is_valid BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id),
  INDEX(account_id),
  INDEX(expires_at)
);
```

## Key Takeaways

✅ **Master can get new token without re-logging in**
  - Call `/api/auth/session/refresh` with new token

✅ **Logs out invalidates session**
  - Session marked invalid, trades stop working
  - Can log back in to create new session

✅ **Session expires after 24 hours**
  - System warns at 1 hour remaining
  - Admin can refresh before/after expiry

✅ **Multiple devices possible**
  - Each device gets own session
  - `invalidateOtherSessions()` forces logout other devices

✅ **No manual token management needed**
  - System validates automatically
  - Expired sessions rejected gracefully
  - Falls back to seeded data if needed
