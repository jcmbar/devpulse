import type {
  DelayJustificationKind,
  DelayJustificationStatus,
} from "@/types/delay-justification";

export type JustificationCopySource = {
  developer_id: string;
  jira_key: string;
  kind: DelayJustificationKind;
  status: DelayJustificationStatus;
  requested_at: string;
  developer_note: string;
  requester_profile_id: string;
  reviewer_profile_id: string | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  due_on: string | null;
  unit_test_delivery_on: string | null;
  delay_days: number | null;
};

export type JustificationDestCard = {
  id: string;
  jira_key: string;
  developer_id: string | null;
  due_on: string | null;
  unit_test_delivery_on: string | null;
  delay_days: number | null;
};

export type JustificationDestExisting = {
  id: string;
  developer_id: string;
  jira_key: string;
  kind: DelayJustificationKind;
  status: DelayJustificationStatus;
  requested_at: string;
};

export type JustificationCopyInsert = JustificationCopySource & {
  jira_card_id: string;
  due_on: string | null;
  unit_test_delivery_on: string | null;
  delay_days: number | null;
};

export type JustificationCopyUpdate = JustificationCopyInsert & {
  id: string;
};

export type JustificationCopyPlan = {
  considered: number;
  inserts: JustificationCopyInsert[];
  updates: JustificationCopyUpdate[];
  skippedNoCard: number;
  skippedAlreadyPresent: number;
};

const STATUS_RANK: Record<DelayJustificationStatus, number> = {
  accepted: 3,
  rejected: 2,
  pending: 1,
};

export function normalizeJustificationJiraKey(value: string): string {
  return value.trim().toUpperCase();
}

export function justificationIdentity(
  developerId: string,
  jiraKey: string,
  kind: DelayJustificationKind,
): string {
  return `${developerId}::${normalizeJustificationJiraKey(jiraKey)}::${kind}`;
}

function isStrongerJustification(
  candidate: { status: DelayJustificationStatus; requested_at: string },
  current: { status: DelayJustificationStatus; requested_at: string },
): boolean {
  const byStatus = STATUS_RANK[candidate.status] - STATUS_RANK[current.status];
  if (byStatus !== 0) {
    return byStatus > 0;
  }
  return candidate.requested_at > current.requested_at;
}

export function pickLatestJustifications<T extends JustificationCopySource>(
  rows: T[],
): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const key = justificationIdentity(row.developer_id, row.jira_key, row.kind);
    const current = best.get(key);
    if (!current || isStrongerJustification(row, current)) {
      best.set(key, row);
    }
  }
  return [...best.values()];
}

/**
 * Plan inserts/updates so a new Compilado lote receives the strongest
 * justification per (developer, jira_key, kind) from prior lotes.
 */
export function planJustificationCopies(input: {
  sourceRows: JustificationCopySource[];
  destCards: JustificationDestCard[];
  destExisting: JustificationDestExisting[];
}): JustificationCopyPlan {
  const sources = pickLatestJustifications(input.sourceRows);
  const cardByDeveloperKey = new Map<string, JustificationDestCard>();
  const cardByJiraKey = new Map<string, JustificationDestCard>();

  for (const card of input.destCards) {
    const jiraKey = normalizeJustificationJiraKey(card.jira_key);
    if (!cardByJiraKey.has(jiraKey)) {
      cardByJiraKey.set(jiraKey, card);
    }
    if (!card.developer_id) {
      continue;
    }
    cardByDeveloperKey.set(`${card.developer_id}::${jiraKey}`, card);
  }

  const destByIdentity = new Map<string, JustificationDestExisting>();
  for (const row of pickLatestJustifications(
    input.destExisting.map((row) => ({
      ...row,
      developer_note: "",
      requester_profile_id: "",
      reviewer_profile_id: null,
      reviewer_note: null,
      reviewed_at: null,
      due_on: null,
      unit_test_delivery_on: null,
      delay_days: null,
    })),
  )) {
    destByIdentity.set(
      justificationIdentity(row.developer_id, row.jira_key, row.kind),
      row,
    );
  }

  const inserts: JustificationCopyInsert[] = [];
  const updates: JustificationCopyUpdate[] = [];
  let skippedNoCard = 0;
  let skippedAlreadyPresent = 0;

  for (const row of sources) {
    const jiraKey = normalizeJustificationJiraKey(row.jira_key);
    const card =
      cardByDeveloperKey.get(`${row.developer_id}::${jiraKey}`) ??
      cardByJiraKey.get(jiraKey);
    if (!card) {
      skippedNoCard += 1;
      continue;
    }

    const payload: JustificationCopyInsert = {
      ...row,
      jira_key: jiraKey,
      jira_card_id: card.id,
      due_on: card.due_on ?? row.due_on,
      unit_test_delivery_on:
        card.unit_test_delivery_on ?? row.unit_test_delivery_on,
      delay_days: card.delay_days ?? row.delay_days,
    };

    const identity = justificationIdentity(
      row.developer_id,
      jiraKey,
      row.kind,
    );
    const existing = destByIdentity.get(identity);
    if (!existing) {
      inserts.push(payload);
      destByIdentity.set(identity, {
        id: `pending-insert:${identity}`,
        developer_id: row.developer_id,
        jira_key: jiraKey,
        kind: row.kind,
        status: row.status,
        requested_at: row.requested_at,
      });
      continue;
    }

    if (!isStrongerJustification(row, existing)) {
      skippedAlreadyPresent += 1;
      continue;
    }

    if (existing.id.startsWith("pending-insert:")) {
      const index = inserts.findIndex(
        (item) =>
          justificationIdentity(item.developer_id, item.jira_key, item.kind) ===
          identity,
      );
      if (index >= 0) {
        inserts[index] = payload;
      }
      continue;
    }

    updates.push({ ...payload, id: existing.id });
    destByIdentity.set(identity, {
      ...existing,
      status: row.status,
      requested_at: row.requested_at,
    });
  }

  return {
    considered: sources.length,
    inserts,
    updates,
    skippedNoCard,
    skippedAlreadyPresent,
  };
}
