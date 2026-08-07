/**
 * Simple per-user cooldown for SMTP test sends.
 * In-memory only (resets on redeploy / cold start) — enough to block spam clicks.
 */

const COOLDOWN_MS = 60_000;

const lastSentByUserId = new Map<string, number>();

export function getSmtpTestCooldownMs(): number {
  return COOLDOWN_MS;
}

export function checkSmtpTestRateLimit(userId: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const last = lastSentByUserId.get(userId);
  if (last == null) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const elapsed = Date.now() - last;
  if (elapsed >= COOLDOWN_MS) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((COOLDOWN_MS - elapsed) / 1000),
  };
}

export function markSmtpTestSent(userId: string): void {
  lastSentByUserId.set(userId, Date.now());
}
