/**
 * In-memory rate limits for sensitive server actions.
 * Keys use authenticated user id (+ optional coarse IP hash) — never storage paths or emails.
 * Resets on cold start / redeploy (same model as SMTP test cooldown).
 */

export type SensitiveRateLimitAction =
  | "signed_url"
  | "backup_zip"
  | "email_send"
  | "email_test"
  | "attachment_upload";

type RateLimitPolicy = {
  max: number;
  windowSec: number;
};

const DEFAULT_POLICIES: Record<SensitiveRateLimitAction, RateLimitPolicy> = {
  signed_url: { max: 30, windowSec: 60 },
  backup_zip: { max: 5, windowSec: 300 },
  email_send: { max: 10, windowSec: 60 },
  email_test: { max: 1, windowSec: 60 },
  attachment_upload: { max: 20, windowSec: 60 },
};

const ENV_KEYS: Record<
  SensitiveRateLimitAction,
  { max: string; window: string }
> = {
  signed_url: {
    max: "SENSITIVE_RATE_SIGNED_URL_MAX",
    window: "SENSITIVE_RATE_SIGNED_URL_WINDOW_SEC",
  },
  backup_zip: {
    max: "SENSITIVE_RATE_ZIP_MAX",
    window: "SENSITIVE_RATE_ZIP_WINDOW_SEC",
  },
  email_send: {
    max: "SENSITIVE_RATE_EMAIL_SEND_MAX",
    window: "SENSITIVE_RATE_EMAIL_SEND_WINDOW_SEC",
  },
  email_test: {
    max: "SENSITIVE_RATE_EMAIL_TEST_MAX",
    window: "SENSITIVE_RATE_EMAIL_TEST_WINDOW_SEC",
  },
  attachment_upload: {
    max: "SENSITIVE_RATE_UPLOAD_MAX",
    window: "SENSITIVE_RATE_UPLOAD_WINDOW_SEC",
  },
};

type BucketState = {
  windowStartMs: number;
  count: number;
};

const buckets = new Map<string, BucketState>();

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw?.trim()) {
    return fallback;
  }
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

export function getSensitiveRateLimitPolicy(
  action: SensitiveRateLimitAction,
): RateLimitPolicy {
  const defaults = DEFAULT_POLICIES[action];
  const keys = ENV_KEYS[action];
  return {
    max: parsePositiveInt(process.env[keys.max], defaults.max),
    windowSec: parsePositiveInt(process.env[keys.window], defaults.windowSec),
  };
}

export type SensitiveRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; message: string };

function bucketKey(input: {
  action: SensitiveRateLimitAction;
  userId: string;
  ipHash?: string | null;
}): string {
  const ip = input.ipHash?.trim() || "-";
  return `${input.action}:${input.userId}:${ip}`;
}

/**
 * Fixed-window counter. Call before the sensitive operation; on allow, the hit is recorded.
 */
export function consumeSensitiveRateLimit(input: {
  action: SensitiveRateLimitAction;
  userId: string;
  /** Optional coarse IP fingerprint (hashed/truncated) — never raw PII keys. */
  ipHash?: string | null;
}): SensitiveRateLimitResult {
  const userId = input.userId.trim();
  if (!userId) {
    return {
      allowed: false,
      retryAfterSeconds: 60,
      message: "Não foi possível validar o limite de uso. Tente novamente.",
    };
  }

  const policy = getSensitiveRateLimitPolicy(input.action);
  const key = bucketKey({
    action: input.action,
    userId,
    ipHash: input.ipHash,
  });
  const now = Date.now();
  const windowMs = policy.windowSec * 1000;
  const current = buckets.get(key);

  if (!current || now - current.windowStartMs >= windowMs) {
    buckets.set(key, { windowStartMs: now, count: 1 });
    return { allowed: true };
  }

  if (current.count >= policy.max) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((current.windowStartMs + windowMs - now) / 1000),
    );
    return {
      allowed: false,
      retryAfterSeconds,
      message: `Muitas tentativas. Aguarde ${retryAfterSeconds}s e tente novamente.`,
    };
  }

  current.count += 1;
  buckets.set(key, current);
  return { allowed: true };
}

/** Test helper — clears in-memory buckets. */
export function resetSensitiveRateLimitsForTests(): void {
  buckets.clear();
}

export function listSensitiveRateLimitDefaults(): Record<
  SensitiveRateLimitAction,
  RateLimitPolicy
> {
  return { ...DEFAULT_POLICIES };
}
