import type {
  JiraStatusGroup,
  JiraStatusGroupMapping,
} from "@/types/jira-flow-analytics";

/**
 * Default aliases for Brazilian / Atlassian-ish boards.
 * Matching is case-insensitive and uses normalized whitespace.
 * Override via integration.settings.status_groups.
 *
 * Governance:
 * - exact alias match is preferred
 * - fuzzy contains is optional (disabled when settings.status_groups.strict = true)
 * - unmatched labels land in `other` and should be reviewed via governance report
 */
export const DEFAULT_STATUS_GROUP_MAPPING: JiraStatusGroupMapping = {
  analysis: [
    "análise",
    "analise",
    "analysis",
    "to do",
    "todo",
    "backlog",
    "selected for development",
    "refinamento",
    "ready",
    "open",
    "triagem",
  ],
  development: [
    "develop",
    "development",
    "em desenvolvimento",
    "in progress",
    "em progresso",
    "doing",
    "dev",
    "coding",
  ],
  validation: [
    "staging",
    "em staging",
    "ready for staging",
    "homologação",
    "homologacao",
    "code review",
    "review",
    "qa",
    "teste",
    "testing",
    "test",
    "validation",
    "validação",
    "validacao",
    "aguardando teste",
  ],
  done: [
    "done",
    "closed",
    "resolved",
    "concluído",
    "concluido",
    "entregue",
    "cancelled",
    "canceled",
    "cancelado",
  ],
  other: [],
};

/** Staging is tracked as a milestone inside validation aliases by default. */
export const DEFAULT_STAGING_ALIASES = [
  "staging",
  "em staging",
  "ready for staging",
  "homologação",
  "homologacao",
];

/** Develop milestone aliases (subset of development). */
export const DEFAULT_DEVELOP_ALIASES = [
  "develop",
  "development",
  "em desenvolvimento",
  "dev",
];

export type StatusMatchKind = "exact" | "fuzzy" | "unmapped" | "empty";

export type StatusClassification = {
  group: JiraStatusGroup;
  normalized: string;
  matchedBy: StatusMatchKind;
  /** Alias or pattern that matched, when applicable. */
  matchedAlias: string | null;
};

export type ResolvedStatusMapping = {
  groups: JiraStatusGroupMapping;
  developAliases: string[];
  stagingAliases: string[];
  /** When true, fuzzy contains matching is disabled (safer for custom boards). */
  strict: boolean;
};

export function normalizeStatusLabel(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeAliasLists(
  defaults: string[],
  overrides: string[] | undefined,
): string[] {
  const set = new Set<string>();
  for (const value of [...defaults, ...(overrides ?? [])]) {
    const normalized = normalizeStatusLabel(value);
    if (normalized) {
      set.add(normalized);
    }
  }
  return [...set];
}

/**
 * Merge integration overrides with defaults.
 * settings.status_groups: { development?: string[], staging_aliases?: string[], strict?: boolean, ... }
 */
export function resolveStatusGroupMapping(
  settings: Record<string, unknown> | null | undefined,
): ResolvedStatusMapping {
  const rawGroups =
    settings && typeof settings.status_groups === "object"
      ? (settings.status_groups as Record<string, unknown>)
      : {};

  const strict = Boolean(rawGroups.strict);

  const groups: JiraStatusGroupMapping = {
    analysis: mergeAliasLists(
      DEFAULT_STATUS_GROUP_MAPPING.analysis,
      Array.isArray(rawGroups.analysis)
        ? rawGroups.analysis.map(String)
        : undefined,
    ),
    development: mergeAliasLists(
      DEFAULT_STATUS_GROUP_MAPPING.development,
      Array.isArray(rawGroups.development)
        ? rawGroups.development.map(String)
        : undefined,
    ),
    validation: mergeAliasLists(
      DEFAULT_STATUS_GROUP_MAPPING.validation,
      Array.isArray(rawGroups.validation)
        ? rawGroups.validation.map(String)
        : undefined,
    ),
    done: mergeAliasLists(
      DEFAULT_STATUS_GROUP_MAPPING.done,
      Array.isArray(rawGroups.done) ? rawGroups.done.map(String) : undefined,
    ),
    other: mergeAliasLists(
      DEFAULT_STATUS_GROUP_MAPPING.other,
      Array.isArray(rawGroups.other) ? rawGroups.other.map(String) : undefined,
    ),
  };

  const developAliases = mergeAliasLists(
    DEFAULT_DEVELOP_ALIASES,
    Array.isArray(rawGroups.develop_aliases)
      ? rawGroups.develop_aliases.map(String)
      : Array.isArray(rawGroups.develop)
        ? rawGroups.develop.map(String)
        : undefined,
  );

  const stagingAliases = mergeAliasLists(
    DEFAULT_STAGING_ALIASES,
    Array.isArray(rawGroups.staging_aliases)
      ? rawGroups.staging_aliases.map(String)
      : Array.isArray(rawGroups.staging)
        ? rawGroups.staging.map(String)
        : undefined,
  );

  groups.development = mergeAliasLists(groups.development, developAliases);
  groups.validation = mergeAliasLists(groups.validation, stagingAliases);

  return { groups, developAliases, stagingAliases, strict };
}

function fuzzyClassify(normalized: string): {
  group: JiraStatusGroup;
  matchedAlias: string;
} | null {
  if (normalized.includes("develop") || normalized.includes("desenvolv")) {
    return { group: "development", matchedAlias: "fuzzy:develop*" };
  }
  if (
    normalized.includes("staging") ||
    normalized.includes("homolog") ||
    normalized.includes("review") ||
    normalized.includes("teste") ||
    normalized.includes("test")
  ) {
    return { group: "validation", matchedAlias: "fuzzy:validation*" };
  }
  if (
    normalized.includes("done") ||
    normalized.includes("closed") ||
    normalized.includes("resolv") ||
    normalized.includes("conclu")
  ) {
    return { group: "done", matchedAlias: "fuzzy:done*" };
  }
  return null;
}

/**
 * Detailed classification for governance / audit.
 * Prefer this over `classifyStatusGroup` when match provenance matters.
 */
export function classifyStatusDetailed(
  status: string | null | undefined,
  mapping: ResolvedStatusMapping | JiraStatusGroupMapping,
): StatusClassification {
  const resolved: ResolvedStatusMapping = "groups" in mapping
    ? mapping
    : { groups: mapping, developAliases: [], stagingAliases: [], strict: false };

  const normalized = normalizeStatusLabel(status);
  if (!normalized) {
    return {
      group: "other",
      normalized: "",
      matchedBy: "empty",
      matchedAlias: null,
    };
  }

  const order: JiraStatusGroup[] = [
    "done",
    "development",
    "validation",
    "analysis",
    "other",
  ];

  for (const group of order) {
    if (resolved.groups[group].includes(normalized)) {
      return {
        group,
        normalized,
        matchedBy: "exact",
        matchedAlias: normalized,
      };
    }
  }

  if (!resolved.strict) {
    const fuzzy = fuzzyClassify(normalized);
    if (fuzzy) {
      return {
        group: fuzzy.group,
        normalized,
        matchedBy: "fuzzy",
        matchedAlias: fuzzy.matchedAlias,
      };
    }
  }

  return {
    group: "other",
    normalized,
    matchedBy: "unmapped",
    matchedAlias: null,
  };
}

export function classifyStatusGroup(
  status: string | null | undefined,
  groups: JiraStatusGroupMapping,
  options?: { strict?: boolean },
): JiraStatusGroup {
  return classifyStatusDetailed(status, {
    groups,
    developAliases: [],
    stagingAliases: [],
    strict: Boolean(options?.strict),
  }).group;
}

export function matchesAlias(
  status: string | null | undefined,
  aliases: string[],
): boolean {
  const normalized = normalizeStatusLabel(status);
  if (!normalized) {
    return false;
  }
  if (aliases.includes(normalized)) {
    return true;
  }
  return aliases.some(
    (alias) => alias.length >= 4 && normalized.includes(alias),
  );
}

export type ObservedStatusStat = {
  status: string;
  normalized: string;
  group: JiraStatusGroup;
  matchedBy: StatusMatchKind;
  matchedAlias: string | null;
  issueCount: number;
  dwellMs: number;
};

/**
 * Classify a bag of observed status labels (e.g. keys of status_dwell_ms).
 */
export function classifyObservedStatuses(
  observations: Array<{ status: string; issueCount?: number; dwellMs?: number }>,
  mapping: ResolvedStatusMapping,
): ObservedStatusStat[] {
  const byNormalized = new Map<string, ObservedStatusStat>();

  for (const observation of observations) {
    const classification = classifyStatusDetailed(observation.status, mapping);
    const key = classification.normalized || "(empty)";
    const existing = byNormalized.get(key);
    if (existing) {
      existing.issueCount += observation.issueCount ?? 1;
      existing.dwellMs += observation.dwellMs ?? 0;
      continue;
    }
    byNormalized.set(key, {
      status: observation.status || "(empty)",
      normalized: key,
      group: classification.group,
      matchedBy: classification.matchedBy,
      matchedAlias: classification.matchedAlias,
      issueCount: observation.issueCount ?? 1,
      dwellMs: observation.dwellMs ?? 0,
    });
  }

  return [...byNormalized.values()].sort((a, b) =>
    a.normalized.localeCompare(b.normalized),
  );
}
