import "server-only";

import { headers } from "next/headers";
import { createHash } from "node:crypto";
import {
  consumeSensitiveRateLimit,
  type SensitiveRateLimitAction,
  type SensitiveRateLimitResult,
} from "@/lib/security/sensitive-rate-limit";
import {
  recordSensitiveAccessAudit,
  type SensitiveAccessAuditEvent,
} from "@/services/security/sensitive-access-audit";

/**
 * Coarse IP fingerprint for secondary rate-limit dimension.
 * Not used as a sole identity key; never logs the raw IP in audit metadata.
 */
export async function getRequestIpHash(): Promise<string | null> {
  try {
    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for");
    const realIp = headerStore.get("x-real-ip");
    const raw = (forwarded?.split(",")[0] ?? realIp ?? "").trim();
    if (!raw) {
      return null;
    }
    return createHash("sha256").update(raw).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

export async function enforceSensitiveRateLimit(input: {
  action: SensitiveRateLimitAction;
  userId: string;
  useIpDimension?: boolean;
  audit?: Omit<SensitiveAccessAuditEvent, "result" | "actorUserId"> & {
    actorUserId?: string | null;
  };
}): Promise<SensitiveRateLimitResult> {
  const ipHash = input.useIpDimension ? await getRequestIpHash() : null;
  const result = consumeSensitiveRateLimit({
    action: input.action,
    userId: input.userId,
    ipHash,
  });

  if (!result.allowed && input.audit) {
    await recordSensitiveAccessAudit({
      ...input.audit,
      actorUserId: input.audit.actorUserId ?? input.userId,
      result: "rate_limited",
      errorCode: `retry_after_${result.retryAfterSeconds}s`,
      metadata: {
        ...input.audit.metadata,
        rate_action: input.action,
      },
    });
  }

  return result;
}
