import { createHash } from "node:crypto";
import type { ResolvedStatusMapping } from "@/services/analytics/jira/status-mapping";

/**
 * Stable hash of the status mapping that drives group classification.
 * Used to detect mapping drift vs materialized daily facts.
 */
export function rulesHash(mapping: ResolvedStatusMapping): string {
  const payload = {
    strict: mapping.strict,
    groups: {
      analysis: [...mapping.groups.analysis].sort(),
      development: [...mapping.groups.development].sort(),
      validation: [...mapping.groups.validation].sort(),
      done: [...mapping.groups.done].sort(),
      other: [...mapping.groups.other].sort(),
    },
    developAliases: [...mapping.developAliases].sort(),
    stagingAliases: [...mapping.stagingAliases].sort(),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}
