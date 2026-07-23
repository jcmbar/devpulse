/**
 * Extract Jira project key prefix from issue keys (e.g. AP-123 → AP).
 * No hardcoded team list — prefix resolution happens via teams table.
 */

const JIRA_KEY_PATTERN = /^([A-Za-z][A-Za-z0-9]*)-(\d+)\b/;

export function extractJiraKeyPrefix(jiraKey: string): string | null {
  const trimmed = jiraKey.trim();
  if (!trimmed) {
    return null;
  }
  const match = JIRA_KEY_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  return match[1].toUpperCase();
}

export type DetectedImportPrefixes = {
  /** Sorted unique prefixes found in valid keys. */
  prefixes: string[];
  keysWithPrefix: number;
  keysWithoutPrefix: number;
  samplesByPrefix: Record<string, string[]>;
};

export function detectJiraKeyPrefixes(
  jiraKeys: string[],
): DetectedImportPrefixes {
  const counts = new Map<string, number>();
  const samples = new Map<string, string[]>();
  let keysWithPrefix = 0;
  let keysWithoutPrefix = 0;

  for (const key of jiraKeys) {
    const prefix = extractJiraKeyPrefix(key);
    if (!prefix) {
      keysWithoutPrefix += 1;
      continue;
    }
    keysWithPrefix += 1;
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    const list = samples.get(prefix) ?? [];
    if (list.length < 3) {
      list.push(key.trim());
      samples.set(prefix, list);
    }
  }

  const prefixes = Array.from(counts.keys()).sort();
  const samplesByPrefix: Record<string, string[]> = {};
  for (const [prefix, list] of samples) {
    samplesByPrefix[prefix] = list;
  }

  return {
    prefixes,
    keysWithPrefix,
    keysWithoutPrefix,
    samplesByPrefix,
  };
}
