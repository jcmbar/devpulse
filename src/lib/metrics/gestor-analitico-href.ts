import type { CompiladoDateRange } from "@/lib/metrics/date-range";
import type { CompiladoSourceMode } from "@/lib/metrics/gestor-data-source";
import type { GestorCardMetricKind } from "@/lib/metrics/developer-period";

export type GestorAnaliticoHrefInput = {
  importId?: string | null;
  from?: string | null;
  to?: string | null;
  month?: string | null;
  source?: CompiladoSourceMode | string | null;
  developerId?: string | null;
  status?: string | null;
  classification?: GestorCardMetricKind | null;
  q?: string | null;
};

/** Build shareable URL for the Gestor analytical ("Base Jira") view. */
export function buildGestorAnaliticoHref(
  input: GestorAnaliticoHrefInput = {},
): string {
  const params = new URLSearchParams();

  if (input.importId) {
    params.set("importId", input.importId);
  }
  if (input.month) {
    params.set("month", input.month);
  } else {
    if (input.from) {
      params.set("from", input.from);
    }
    if (input.to) {
      params.set("to", input.to);
    }
  }
  if (input.source && input.source !== "auto") {
    params.set("source", String(input.source));
  }
  if (input.developerId) {
    params.set("developerId", input.developerId);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.classification && input.classification !== "cards") {
    params.set("class", input.classification);
  }
  if (input.q?.trim()) {
    params.set("q", input.q.trim());
  }

  const query = params.toString();
  return query ? `/app/gestor/analitico?${query}` : "/app/gestor/analitico";
}

export function buildGestorAnaliticoHrefFromRange(input: {
  importId?: string | null;
  dateRange: CompiladoDateRange;
  source?: CompiladoSourceMode | null;
  developerId?: string | null;
}): string {
  return buildGestorAnaliticoHref({
    importId: input.importId,
    from: input.dateRange.mode === "custom" ? input.dateRange.start : null,
    to: input.dateRange.mode === "custom" ? input.dateRange.end : null,
    month: input.dateRange.mode === "month" ? input.dateRange.month : null,
    source: input.source,
    developerId: input.developerId,
  });
}
