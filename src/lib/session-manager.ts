import fs from 'fs';
import path from 'path';

export interface SessionToken {
  accountId: string;
  token: string;
  issuedAt: number; // Unix timestamp in milliseconds
  expiresAt: number; // Unix timestamp in milliseconds
  refreshToken?: string;
  source: 'oauth-vendor' | 'oauth-standard' | 'api-key' | 'manual'; // How the token was obtained
  isValid: boolean;
}

export interface SessionTokens {
  [accountId: string]: SessionToken;
}

const SESSION_FILE = process.env.ALICE_SESSION_FILE || '.alice.sessions.json';

/**
 * Read all stored session tokens with metadata
 */
export function readSessions(): SessionTokens {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
      return JSON.parse(raw || '{}');
    }
  } catch (e) {
    console.error('[SESSION] Failed reading sessions file', e);
  }
  return {};
}

/**
 * Write session tokens to file
 */
export function writeSessions(sessions: SessionTokens) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2), { encoding: 'utf-8', flag: 'w' });
    console.log('[SESSION] Saved sessions to file');
  } catch (e) {
    console.error('[SESSION] Failed writing sessions file', e);
  }
}

/**
 * Save a new session token with metadata
 */
export function saveSession(
  accountId: string,
  token: string,
  options: {
    expiresIn?: number; // TTL in seconds (default: 24 hours)
    refreshToken?: string;
    source?: SessionToken['source'];
  } = {}
): SessionToken {
  const sessions = readSessions();
  const now = Date.now();
  const expiresInMs = (options.expiresIn || 86400) * 1000; // Default 24 hours

  const session: SessionToken = {
    accountId,
    token,
    issuedAt: now,
    expiresAt: now + expiresInMs,
    refreshToken: options.refreshToken,
    source: options.source || 'oauth-vendor',
    isValid: true,
  };

  sessions[accountId] = session;
  writeSessions(sessions);

  console.log(`[SESSION] Saved session for ${accountId}, expires in ${options.expiresIn || 86400}s`);
  return session;
}

/**
 * Get a session by account ID
 */
export function getSession(accountId: string): SessionToken | null {
  const sessions = readSessions();
  return sessions[accountId] || null;
}

/**
 * Check if a session token is still valid
 */
export function isSessionValid(accountId: string): boolean {
  const session = getSession(accountId);
  if (!session) return false;

  const now = Date.now();
  const isExpired = now > session.expiresAt;
  const isInvalid = !session.isValid;

  if (isExpired) {
    console.log(`[SESSION] Session for ${accountId} has expired`);
    return false;
  }

  if (isInvalid) {
    console.log(`[SESSION] Session for ${accountId} is marked invalid`);
    return false;
  }

  // Warn if session is expiring soon (within 1 hour)
  const expiresIn = session.expiresAt - now;
  if (expiresIn < 3600000) {
    console.warn(`[SESSION] Session for ${accountId} expires in ${Math.floor(expiresIn / 1000)}s`);
  }

  return true;
}

/**
 * Get remaining time until session expires (in milliseconds)
 */
export function getSessionTimeRemaining(accountId: string): number | null {
  const session = getSession(accountId);
  if (!session) return null;

  const remaining = session.expiresAt - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * Invalidate a session (mark as logout)
 */
export function invalidateSession(accountId: string) {
  const sessions = readSessions();
  if (sessions[accountId]) {
    sessions[accountId].isValid = false;
    writeSessions(sessions);
    console.log(`[SESSION] Session for ${accountId} invalidated`);
  }
}

/**
 * Remove a session completely
 */
export function deleteSession(accountId: string) {
  const sessions = readSessions();
  if (sessions[accountId]) {
    delete sessions[accountId];
    writeSessions(sessions);
    console.log(`[SESSION] Session for ${accountId} deleted`);
  }
}

/**
 * Get session info for display (masked token)
 */
export function getSessionInfo(accountId: string) {
  const session = getSession(accountId);
  if (!session) return null;

  const now = Date.now();
  const timeRemaining = Math.max(0, session.expiresAt - now);
  const isExpired = timeRemaining === 0;
  const isExpiringSoon = timeRemaining < 3600000 && !isExpired; // Within 1 hour

  return {
    accountId: session.accountId,
    tokenMask: `${session.token.slice(0, 10)}...${session.token.slice(-4)}`,
    issuedAt: new Date(session.issuedAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    timeRemaining,
    isExpired,
    isExpiringSoon,
    isValid: session.isValid && !isExpired,
    source: session.source,
  };
}

/**
 * Cleanup expired sessions
 */
export function cleanupExpiredSessions() {
  const sessions = readSessions();
  const now = Date.now();
  let cleanedCount = 0;

  Object.keys(sessions).forEach(accountId => {
    const session = sessions[accountId];
    if (now > session.expiresAt) {
      delete sessions[accountId];
      cleanedCount++;
    }
  });

  if (cleanedCount > 0) {
    writeSessions(sessions);
    console.log(`[SESSION] Cleaned up ${cleanedCount} expired sessions`);
  }

  return cleanedCount;
}

/**
 * When master logs out, invalidate all-except the specific session
 * This allows multiple devices to have different sessions
 */
export function invalidateOtherSessions(accountId: string) {
  const sessions = readSessions();
  let invalidatedCount = 0;

  Object.keys(sessions).forEach(id => {
    // Keep current session, invalidate others for same account
    if (id !== accountId && sessions[id].accountId === accountId) {
      sessions[id].isValid = false;
      invalidatedCount++;
    }
  });

  if (invalidatedCount > 0) {
    writeSessions(sessions);
    console.log(`[SESSION] Invalidated ${invalidatedCount} other sessions for ${accountId}`);
  }

  return invalidatedCount;
}
