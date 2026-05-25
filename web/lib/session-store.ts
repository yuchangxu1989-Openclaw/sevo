/**
 * In-memory session token store (single-process).
 * Tokens are random UUIDs — no deterministic hash from password.
 */

const sessions = new Map<string, { createdAt: number }>();

export function addSession(token: string): void {
  sessions.set(token, { createdAt: Date.now() });
}

export function hasSession(token: string): boolean {
  return sessions.has(token);
}

export function removeSession(token: string): void {
  sessions.delete(token);
}

export function clearAllSessions(): void {
  sessions.clear();
}
