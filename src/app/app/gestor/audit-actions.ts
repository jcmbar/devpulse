"use server";

import type { CompiladoDateRange } from "@/lib/metrics/date-range";
import {
  getCardDeliveryFlags,
  type GestorCardMetricKind,
} from "@/lib/metrics/developer-period";
import { annotateGestorCardForAudit } from "@/lib/metrics/gestor-card-audit";
import {
  parseCompiladoSourceMode,
  type CompiladoSourceMode,
} from "@/lib/metrics/gestor-data-source";
import { parseJiraKeys } from "@/lib/metrics/gestor-key-compare";
import { requirePermission } from "@/lib/auth/permissions";
import {
  getGestorDeveloperCardsAudit,
  type GestorDeveloperCardsAudit,
} from "@/services/gestor/developer-cards-audit";
import { listJiraCardsByKeysInImport } from "@/services/jira-cards";

export type LoadGestorDeveloperCardsAuditInput = {
  developerId: string;
  importId?: string | null;
  from: string;
  to: string;
  mode: CompiladoDateRange["mode"];
  month?: string | null;
  source?: string | null;
  metric?: GestorCardMetricKind;
};

export type LoadGestorDeveloperCardsAuditResult =
  | { ok: true; data: GestorDeveloperCardsAudit }
  | { ok: false; error: string };

export async function loadGestorDeveloperCardsAuditAction(
  input: LoadGestorDeveloperCardsAuditInput,
): Promise<LoadGestorDeveloperCardsAuditResult> {
  try {
    await requirePermission("gestor", "access");

    if (!input.developerId.trim()) {
      return { ok: false, error: "Developer inválido." };
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.to)
    ) {
      return { ok: false, error: "Intervalo de datas inválido." };
    }

    const dataSource: CompiladoSourceMode = parseCompiladoSourceMode(
      input.source ?? undefined,
    );
    const dateRange: CompiladoDateRange = {
      start: input.from,
      end: input.to,
      mode: input.mode,
      month: input.month ?? null,
    };

    const data = await getGestorDeveloperCardsAudit({
      developerId: input.developerId,
      importId: input.importId ?? null,
      dateRange,
      dataSource,
      metric: input.metric ?? "cards",
    });

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os cards.",
    };
  }
}

export type GestorKeyLookupHit = {
  key: string;
  found: boolean;
  /** Same developer + import, ignoring period filter. */
  inDeveloperImport: boolean;
  /** Same import, possibly another developer. */
  inImportOtherDeveloper: boolean;
  developerId: string | null;
  unitTestDeliveryOn: string | null;
  startedOn: string | null;
  dueOn: string | null;
  completedOn: string | null;
  delayDays: number | null;
  importId: string | null;
  classificationLabels: string[];
  inclusionNote: string;
};

export type LookupGestorKeysOutsidePeriodResult =
  | { ok: true; hits: GestorKeyLookupHit[] }
  | { ok: false; error: string };

/**
 * Investigation helper: locate pasted keys in the resolved import without the
 * ranking date window. Explains "ausente da auditoria atual".
 */
export async function lookupGestorKeysOutsidePeriodAction(input: {
  developerId: string;
  importId: string;
  from: string;
  to: string;
  keysText: string;
}): Promise<LookupGestorKeysOutsidePeriodResult> {
  try {
    await requirePermission("gestor", "access");

    const keys = parseJiraKeys(input.keysText);
    if (keys.length === 0) {
      return { ok: true, hits: [] };
    }
    if (!input.importId.trim()) {
      return { ok: false, error: "Lote/import não resolvido para lookup." };
    }

    const dateRange: CompiladoDateRange = {
      start: input.from,
      end: input.to,
      mode: "custom",
      month: null,
    };

    const [forDeveloper, inImport] = await Promise.all([
      listJiraCardsByKeysInImport({
        importId: input.importId,
        keys,
        developerId: input.developerId,
      }),
      listJiraCardsByKeysInImport({
        importId: input.importId,
        keys,
      }),
    ]);

    const byKeyDev = new Map(
      forDeveloper.map((card) => [card.jira_key.toUpperCase(), card]),
    );
    const byKeyImport = new Map(
      inImport.map((card) => [card.jira_key.toUpperCase(), card]),
    );

    const hits: GestorKeyLookupHit[] = keys.map((key) => {
      const forDev = byKeyDev.get(key) ?? null;
      const anyInImport = byKeyImport.get(key) ?? null;
      const card = forDev ?? anyInImport;

      if (!card) {
        return {
          key,
          found: false,
          inDeveloperImport: false,
          inImportOtherDeveloper: false,
          developerId: null,
          unitTestDeliveryOn: null,
          startedOn: null,
          dueOn: null,
          completedOn: null,
          delayDays: null,
          importId: null,
          classificationLabels: [],
          inclusionNote:
            "Não encontrado neste lote Compilado (nem para outros developers).",
        };
      }

      const flags = getCardDeliveryFlags(card);
      const annotations = annotateGestorCardForAudit({
        card,
        dateRange,
        resolvedImportId: input.importId,
        metric: "cards",
      });
      const inDeveloperImport = forDev != null;
      const inImportOtherDeveloper = !inDeveloperImport && anyInImport != null;

      let inclusionNote = annotations.inclusionReason;
      if (inImportOtherDeveloper) {
        inclusionNote = `Existe no lote, mas em outro developer_id (${card.developer_id ?? "null"}). ${inclusionNote}`;
      } else if (!annotations.inPeriodByUnitTestDelivery) {
        inclusionNote = `Existe no lote do developer, mas fora do filtro atual. ${inclusionNote}`;
      }

      return {
        key,
        found: true,
        inDeveloperImport,
        inImportOtherDeveloper,
        developerId: card.developer_id,
        unitTestDeliveryOn: card.unit_test_delivery_on,
        startedOn: card.started_on,
        dueOn: card.due_on,
        completedOn: card.completed_on,
        delayDays: card.delay_days,
        importId: card.import_id,
        classificationLabels: [
          ...(flags.isOnTime ? ["No prazo"] : []),
          ...(flags.isDelayed ? ["Atraso"] : []),
          ...(flags.isRework ? ["Retrabalho"] : []),
          ...(flags.isOnTime == null && flags.isDelayed == null
            ? ["Atenção"]
            : []),
        ],
        inclusionNote,
      };
    });

    return { ok: true, hits };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível investigar as chaves.",
    };
  }
}
