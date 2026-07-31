export type NormalizedWorklog = {
  jiraWorklogId: string;
  authorAccountId: string | null;
  authorDisplayName: string | null;
  timeSpentSeconds: number;
  startedAt: string | null;
  createdAtJira: string | null;
  updatedAtJira: string | null;
  commentText: string | null;
  rawPayload: Record<string, unknown>;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function extractCommentText(comment: unknown): string | null {
  if (typeof comment === "string") {
    return comment.trim() || null;
  }
  if (!comment || typeof comment !== "object") {
    return null;
  }
  // ADF simplified: collect text nodes shallowly.
  const doc = comment as { content?: unknown[] };
  const parts: string[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== "object") {
      return;
    }
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === "string") {
      parts.push(n.text);
    }
    for (const child of n.content ?? []) {
      walk(child);
    }
  }
  walk(doc);
  const text = parts.join("").trim();
  return text || null;
}

export function normalizeWorklog(raw: unknown): NormalizedWorklog | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const jiraWorklogId = asString(row.id);
  if (!jiraWorklogId) {
    return null;
  }
  const author =
    row.author && typeof row.author === "object"
      ? (row.author as Record<string, unknown>)
      : null;

  return {
    jiraWorklogId,
    authorAccountId: asString(author?.accountId),
    authorDisplayName: asString(author?.displayName),
    timeSpentSeconds: asNumber(row.timeSpentSeconds),
    startedAt: asString(row.started),
    createdAtJira: asString(row.created),
    updatedAtJira: asString(row.updated),
    commentText: extractCommentText(row.comment),
    rawPayload: row,
  };
}
