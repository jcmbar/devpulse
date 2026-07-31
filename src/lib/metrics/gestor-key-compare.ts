/**
 * Client/server-safe helpers for paste-based Jira key inspection in Gestor audit.
 * Does not change ranking aggregation.
 */

export function normalizeJiraKey(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Split pasted keys on commas, whitespace, semicolons, or newlines. */
export function parseJiraKeys(raw: string): string[] {
  if (!raw.trim()) {
    return [];
  }

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const key = normalizeJiraKey(part);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export type GestorKeyPresence = "present" | "absent";

export type GestorKeyCompareBucket = "only_devpulse" | "only_jira" | "inspect";

export type GestorKeyCompareResult = {
  key: string;
  bucket: GestorKeyCompareBucket;
  presence: GestorKeyPresence;
};

export function compareKeysToAuditSet(input: {
  auditKeys: Iterable<string>;
  onlyDevPulseKeys: string[];
  onlyJiraKeys: string[];
  /** Extra keys without an expected side (optional free-form inspect). */
  inspectKeys?: string[];
}): GestorKeyCompareResult[] {
  const audit = new Set(
    [...input.auditKeys].map((key) => normalizeJiraKey(key)),
  );
  const results: GestorKeyCompareResult[] = [];
  const seen = new Set<string>();

  const push = (key: string, bucket: GestorKeyCompareBucket) => {
    const normalized = normalizeJiraKey(key);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    results.push({
      key: normalized,
      bucket,
      presence: audit.has(normalized) ? "present" : "absent",
    });
  };

  for (const key of input.onlyDevPulseKeys) {
    push(key, "only_devpulse");
  }
  for (const key of input.onlyJiraKeys) {
    push(key, "only_jira");
  }
  for (const key of input.inspectKeys ?? []) {
    push(key, "inspect");
  }

  return results;
}

export function summarizeKeyCompare(results: GestorKeyCompareResult[]): {
  presentCount: number;
  absentCount: number;
  onlyDevPulsePresent: number;
  onlyDevPulseAbsent: number;
  onlyJiraPresent: number;
  onlyJiraAbsent: number;
} {
  let presentCount = 0;
  let absentCount = 0;
  let onlyDevPulsePresent = 0;
  let onlyDevPulseAbsent = 0;
  let onlyJiraPresent = 0;
  let onlyJiraAbsent = 0;

  for (const row of results) {
    if (row.presence === "present") {
      presentCount += 1;
    } else {
      absentCount += 1;
    }
    if (row.bucket === "only_devpulse") {
      if (row.presence === "present") {
        onlyDevPulsePresent += 1;
      } else {
        onlyDevPulseAbsent += 1;
      }
    }
    if (row.bucket === "only_jira") {
      if (row.presence === "present") {
        onlyJiraPresent += 1;
      } else {
        onlyJiraAbsent += 1;
      }
    }
  }

  return {
    presentCount,
    absentCount,
    onlyDevPulsePresent,
    onlyDevPulseAbsent,
    onlyJiraPresent,
    onlyJiraAbsent,
  };
}

/** Seed for the Luis Arruda count-divergence investigation. */
export const GESTOR_KEY_COMPARE_PRESET_LUIS = {
  label: "Caso Luis · divergência DevPulse vs Jira",
  onlyDevPulse: [
    "AP-7368",
    "AP-7416",
    "AP-7431",
    "AP-7462",
    "AP-7484",
    "AP-7489",
    "AP-7490",
    "AP-7491",
    "AP-7592",
    "AP-7609",
    "AP-7618",
  ],
  onlyJira: ["AP-7516"],
} as const;
