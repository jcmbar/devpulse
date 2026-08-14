import type { MonthlyClosingItem } from "@/types/monthly-closing";

export type JiraPostFinalizeLiveCard = {
  jira_key: string;
  summary: string | null;
  status: string | null;
  estimate_hours: number | null;
  time_spent_hours: number | null;
  delay_days: number | null;
  due_on: string | null;
  unit_test_delivery_on: string | null;
  is_rework: boolean;
  rework_weight: number | null;
};

export type JiraPostFinalizeFieldChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type JiraPostFinalizeCardDiff = {
  jiraKey: string;
  snapshotSummary: string | null;
  kind: "changed" | "missing";
  changes: JiraPostFinalizeFieldChange[];
};

function normalizeCompareNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }
  return String(Math.round(value * 1000) / 1000);
}

function displayText(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "—";
}

function displayDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return value;
  }
  const [, month, date] = day.split("-");
  return `${date}/${month}/${day.slice(0, 4)}`;
}

function displayHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;
}

function displayDays(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`;
}

function displayBool(value: boolean): string {
  return value ? "Sim" : "Não";
}

function displayWeight(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function pushIfChanged(
  changes: JiraPostFinalizeFieldChange[],
  input: {
    field: string;
    label: string;
    same: boolean;
    before: string;
    after: string;
  },
) {
  if (!input.same) {
    changes.push({
      field: input.field,
      label: input.label,
      before: input.before,
      after: input.after,
    });
  }
}

export function diffClosingItemAgainstLiveCard(
  item: MonthlyClosingItem,
  live: JiraPostFinalizeLiveCard | null,
): JiraPostFinalizeCardDiff | null {
  if (!live) {
    return {
      jiraKey: item.jira_key,
      snapshotSummary: item.summary,
      kind: "missing",
      changes: [],
    };
  }

  const changes: JiraPostFinalizeFieldChange[] = [];

  pushIfChanged(changes, {
    field: "summary",
    label: "Resumo",
    same: (live.summary ?? null) === (item.summary ?? null),
    before: displayText(item.summary),
    after: displayText(live.summary),
  });
  pushIfChanged(changes, {
    field: "status",
    label: "Status",
    same: (live.status ?? null) === (item.status_name ?? null),
    before: displayText(item.status_name),
    after: displayText(live.status),
  });
  pushIfChanged(changes, {
    field: "estimate_hours",
    label: "Horas previstas",
    same:
      normalizeCompareNumber(
        live.estimate_hours == null ? null : Number(live.estimate_hours),
      ) === normalizeCompareNumber(item.estimate_hours),
    before: displayHours(item.estimate_hours),
    after: displayHours(
      live.estimate_hours == null ? null : Number(live.estimate_hours),
    ),
  });
  pushIfChanged(changes, {
    field: "actual_hours",
    label: "Horas realizadas",
    same:
      normalizeCompareNumber(
        live.time_spent_hours == null ? null : Number(live.time_spent_hours),
      ) === normalizeCompareNumber(item.actual_hours),
    before: displayHours(item.actual_hours),
    after: displayHours(
      live.time_spent_hours == null ? null : Number(live.time_spent_hours),
    ),
  });
  pushIfChanged(changes, {
    field: "delay_days",
    label: "Atraso",
    same:
      normalizeCompareNumber(
        live.delay_days == null ? null : Number(live.delay_days),
      ) === normalizeCompareNumber(item.delay_days),
    before: displayDays(item.delay_days),
    after: displayDays(
      live.delay_days == null ? null : Number(live.delay_days),
    ),
  });
  pushIfChanged(changes, {
    field: "due_on",
    label: "Prazo",
    same: (live.due_on ?? null) === (item.due_on ?? null),
    before: displayDate(item.due_on),
    after: displayDate(live.due_on),
  });
  pushIfChanged(changes, {
    field: "unit_test_delivery_on",
    label: "Entrega TU",
    same:
      (live.unit_test_delivery_on ?? null) ===
      (item.unit_test_delivery_on ?? null),
    before: displayDate(item.unit_test_delivery_on),
    after: displayDate(live.unit_test_delivery_on),
  });
  pushIfChanged(changes, {
    field: "is_rework",
    label: "Retrabalho",
    same: Boolean(live.is_rework) === item.is_rework,
    before: displayBool(item.is_rework),
    after: displayBool(Boolean(live.is_rework)),
  });
  pushIfChanged(changes, {
    field: "rework_weight",
    label: "Peso retrabalho",
    same:
      normalizeCompareNumber(
        live.rework_weight == null ? null : Number(live.rework_weight),
      ) === normalizeCompareNumber(item.rework_weight),
    before: displayWeight(item.rework_weight),
    after: displayWeight(
      live.rework_weight == null ? null : Number(live.rework_weight),
    ),
  });

  if (changes.length === 0) {
    return null;
  }

  return {
    jiraKey: item.jira_key,
    snapshotSummary: item.summary,
    kind: "changed",
    changes,
  };
}
