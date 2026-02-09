# Master Account Session & Token Management Guide

## Overview

The master account now uses a comprehensive session management system that tracks OAuth token validity, expiry time, and allows for token refresh without requiring a full re-authentication.

## How Session Management Works

### 1. Session Storage

When a master authenticates via OAuth, a session record is created with:
- **Account ID**: The master's Alice Blue user ID
- **Token**: The OAuth session token from Alice Blue
- **Issued At**: When the token was obtained
- **Expires At**: When the token expires (default 24 hours)
- **Source**: How the token was obtained (`oauth-vendor`)
- **Is Valid**: Whether the session is still valid (not logged out)

```json
{
  "userId123": {
    "accountId": "userId123",
    "token": "abc123xyz789...",
    "issuedAt": 1708156800000,
    "expiresAt": 1708243200000,
    "refreshToken": null,
    "source": "oauth-vendor",
    "isValid": true
  }
}
```

### 2. Session Lifecycle

```
OAuth Login → Session Created
    ↓
24 Hours (Default)
    ↓
Session Expires → Token Invalid
    ↓
Option 1: Logout → Session Marked Invalid
Option 2: Refresh Token → Session Updated
Option 3: Re-auth → New Session Created
```

### 3. Session Validation

Before fetching trades, the system checks:
- Is the session still in the validity window?
- Has the session been explicitly logged out?
- Is the token close to expiring (warning at 1 hour remaining)?

## API Endpoints

### 1. Verify Session `/api/auth/session/verify` (POST)

Check if a master's session is still valid.

**Request:**
```bash
curl -X POST http://localhost:3000/api/auth/session/verify \
  -H "Content-Type: application/json" \
  -d '{"accountId": "userId123"}'
```

**Response (Valid):**
```json
{
  "ok": true,
  "valid": true,
  "session": {
    "accountId": "userId123",
    "tokenMask": "abc123xyz7...xyz789",
    "issuedAt": "2024-02-17T12:00:00Z",
    "expiresAt": "2024-02-18T12:00:00Z",
    "timeRemaining": 3600000,
    "isExpired": false,
    "isExpiringSoon": true,
    "isValid": true,
    "source": "oauth-vendor"
  }
}
```

**Response (Invalid/Expired):**
```json
{
  "ok": true,
  "valid": false,
  "message": "Session expired or invalid"
}
```

### 2. Get Session Info `/api/auth/session/info` (GET)

Get detailed information about a master's session without validating it.

**Request:**
```bash
curl http://localhost:3000/api/auth/session/info?accountId=userId123
```

**Response:**
```json
{
  "ok": true,
  "session": {
    "accountId": "userId123",
    "tokenMask": "abc123xyz7...xyz789",
    "issuedAt": "2024-02-17T12:00:00Z",
    "expiresAt": "2024-02-18T12:00:00Z",
    "timeRemaining": 3600000,
    "isExpired": false,
    "isExpiringSoon": true,
    "isValid": true,
    "source": "oauth-vendor"
  }
}
```

### 3. Refresh Token `/api/auth/session/refresh` (POST)

Update the session token when it expires or when the master wants to refresh.

**Request:**
```bash
curl -X POST http://localhost:3000/api/auth/session/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "userId123",
    "newToken": "newTokenFromAliceBlue...",
    "expiresIn": 86400
  }'
```

**Response:**
```json
{
  "ok": true,
  "message": "Session token updated",
  "session": {
    "accountId": "userId123",
    "tokenMask": "newToken...789",
    "expiresAt": "2024-02-19T12:00:00Z",
    "isValid": true
  }
}
```

### 4. Logout `/api/auth/logout` (POST)

Logs out the master and invalidates their session.

**Request:**
```bash
curl -X POST http://localhost:3000/api/auth/logout
```

**What happens:**
1. Session is marked as `isValid: false`
2. Auth cookie is cleared
3. Master can log back in and will get a new session
4. Old session token becomes invalid

## Key Features

### ✅ Session Expiry Tracking

The system automatically:
- Tracks when tokens were issued
- Calculates expiry times
- Warns when tokens are expiring soon (within 1 hour)
- Prevents use of expired tokens

### ✅ Automatic Session Validation

Before fetching trades, the system checks:
```typescript
isSessionValid(accountId)  // Returns true/false
getSessionInfo(accountId)  // Returns detailed info
```

### ✅ One-Click Token Refresh

When a token expires, the master can:
1. Get a new token from Alice Blue (via OAuth or API)
2. Call `/api/auth/session/refresh` with the new token
3. Continue using the system without re-logging in

### ✅ Automatic Cleanup

The system automatically:
- Cleans up expired sessions when they're accessed
- Marks invalid sessions after logout
- Provides session metadata for admin oversight

### ✅ Multiple Session Support

Each master can have multiple active sessions (different devices):
```typescript
// Logout on all OTHER devices while keeping current one
invalidateOtherSessions(accountId)
```

## FAQ

### Q: Do I need to re-login if my token expires?

**A:** No! You have options:
1. **Refresh endpoint**: Update the token programmatically via `/api/auth/session/refresh`
2. **OAuth re-auth**: Re-do the OAuth flow to get a new token
3. **API endpoint**: Get a new token from Alice Blue's API and refresh via endpoint

### Q: What happens when I logout?

**A:** 
- Your session is marked as invalid
- Auth cookie is cleared
- Your session token is still stored but won't work for trade fetching
- Next login will create a new session

### Q: Can a logged-out master change their token and log back in?

**A:** Yes! 
1. Master logs out (session marked invalid)
2. Master authenticates again with OAuth
3. New session is created with fresh token
4. Master can fetch tradebook realtime trades

**OR** Without OAuth:
1. Admin updates token via `/api/auth/session/refresh`
2. Master logs in normally
3. System uses new token for trade fetching

### Q: How long is a session valid?

**A:** Default is 24 hours (86400 seconds). You can change this by:
1. Modifying `expiresIn` parameter when refreshing
2. Setting environment variable `ALICE_SESSION_TTL=<seconds>`

### Q: What if Alice Blue API returns refresh tokens?

**A:** The system stores refresh tokens:
```typescript
saveSession(accountId, accessToken, {
  refreshToken: "refresh_token_from_alice_blue",
  expiresIn: 3600, // 1 hour access token
})
```

Then implement automatic refresh:
```typescript
// When token expires, use refreshToken to get new accessToken
const newAccessToken = await refreshTokenWithAliceBlue(refreshToken);
await saveSession(accountId, newAccessToken, { refreshToken });
```

## Troubleshooting

### Issue: "Session expired or invalid"

**Solution:**
1. Check session status: `curl http://localhost:3000/api/auth/session/info?accountId=userId`
2. If expired, refresh token: `curl -X POST .../api/auth/session/refresh -d '...'`
3. Or logout and login again via OAuth

### Issue: "No OAuth token found for this account"

**Solution:**
1. Verify session exists: `curl http://localhost:3000/api/auth/session/info?accountId=userId`
2. If missing, do OAuth flow again
3. Or manually set token via refresh endpoint

### Issue: Trades stop updating after 24 hours

**Solution:**
1. Session has expired
2. Run: `curl http://localhost:3000/api/auth/session/verify -d '{"accountId":"userId"}'`
3. If expired, refresh or re-authenticate

## Admin Dashboard Integration

Future: Add a UI section for:
- View all active sessions
- See session expiry times
- Manually refresh tokens
- Invalidate other sessions (force logout from other devices)
- View token usage and audit log

## Security Considerations

1. **Token Storage**: Tokens stored in `.alice.sessions.json` file (should be in secure location)
2. **Session Metadata**: Only token mask is displayed in logs (not full token)
3. **Session Invalidation**: Logout properly invalidates sessions
4. **Token Refresh**: New tokens are validated before being accepted
5. **Expiry Handling**: Expired tokens automatically rejected

## Example Flow: Manual Token Refresh

```bash
# 1. Check current session
curl http://localhost:3000/api/auth/session/info?accountId=userId123

# 2. Get new token from Alice Blue (via OAuth or API)
# ... Alice Blue OAuth or API call ...

# 3. Refresh the session
curl -X POST http://localhost:3000/api/auth/session/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "userId123",
    "newToken": "newTokenFromAliceBlue",
    "expiresIn": 86400
  }'

# 4. Verify new session is valid
curl http://localhost:3000/api/auth/session/verify \
  -H "Content-Type: application/json" \
  -d '{"accountId": "userId123"}'

# 5. Start fetching trades with new token
curl http://localhost:3000/api/alice/trades
```

## Roadmap

- [ ] Add refresh token support (automatic token refresh)
- [ ] Implement session revocation endpoint
- [ ] Add session audit logging
- [ ] Create admin UI for session management
- [ ] Add webhook for Alice Blue token expiry notifications
- [ ] Implement graceful token fallback mechanism
