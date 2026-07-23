import {
  analyzeImportDeliveryStats,
  assertImportHasDeliveryDates,
  buildImportDeliveryWarnings,
} from "@/lib/imports/delivery-stats";
import { parseSpreadsheet } from "@/lib/imports/parsers";
import { resolveImportTeamFromKeys } from "@/lib/imports/resolve-import-team";
import type {
  SpreadsheetParserVersion,
  SpreadsheetParseResult,
} from "@/lib/imports/types";
import { computeBusinessDayDelay } from "@/lib/metrics/business-days";
import { toDecimalHours } from "@/lib/metrics/hours";
import { detectRework } from "@/lib/metrics/rework";
import {
  findOrCreateDeveloperByResponsible,
  assignDeveloperTeamIfEmpty,
} from "@/services/developers";
import {
  createImport,
  updateImportStatus,
} from "@/services/imports";
import { archiveOlderImportsForTeam } from "@/services/imports/retention";
import { insertJiraCards } from "@/services/jira-cards";
import { buildSnapshotsForImport } from "@/services/productivity-snapshots";
import type { ImportRecord } from "@/types/import";
import type { JiraCardInsert } from "@/types/jira-card";
import type { Team } from "@/types/team";

export type RunSpreadsheetImportInput = {
  importedBy: string;
  fileName: string;
  fileBuffer: Buffer;
  parserVersion?: SpreadsheetParserVersion;
};

export type RunSpreadsheetImportResult = {
  importRecord: ImportRecord;
  parseResult: SpreadsheetParseResult;
  insertedCount: number;
  developersLinked: number;
  snapshotsCreated: number;
  deliveryMin: string;
  deliveryMax: string;
  rowsWithDelivery: number;
  team: Team;
  jiraKeyPrefix: string;
  archivedOlderCount: number;
};

export async function runSpreadsheetImport(
  input: RunSpreadsheetImportInput,
): Promise<RunSpreadsheetImportResult> {
  const parseResult = parseSpreadsheet(
    {
      buffer: input.fileBuffer,
      fileName: input.fileName,
    },
    input.parserVersion,
  );

  const teamResolution = await resolveImportTeamFromKeys(
    parseResult.rows.map((row) => row.jiraKey),
  );
  if (!teamResolution.ok) {
    throw new Error(teamResolution.error);
  }

  const deliveryStats = analyzeImportDeliveryStats(parseResult.rows);
  assertImportHasDeliveryDates(deliveryStats);
  parseResult.warnings.push(...buildImportDeliveryWarnings(deliveryStats));
  parseResult.warnings.push(
    `Time detectado: ${teamResolution.team.name} (prefixo ${teamResolution.prefix}).`,
  );

  const deliveryMin = deliveryStats.deliveryMin!;
  const deliveryMax = deliveryStats.deliveryMax!;

  const importRecord = await createImport({
    importedBy: input.importedBy,
    teamId: teamResolution.team.id,
    periodStart: deliveryMin,
    periodEnd: deliveryMax,
    cardsWithDeliveryCount: deliveryStats.rowsWithDelivery,
    sourceLabel: input.fileName,
    source: "spreadsheet",
    notes: `jira_prefix=${teamResolution.prefix}; team_code=${teamResolution.team.code}`,
  });

  try {
    await updateImportStatus({
      importId: importRecord.id,
      status: "processing",
      startedAt: new Date().toISOString(),
    });

    const developerCache = new Map<string, string | null>();
    let developersLinked = 0;
    const cardRows: JiraCardInsert[] = [];

    for (const row of parseResult.rows) {
      const cacheKey = `${row.responsibleEmail ?? ""}::${row.responsibleName ?? ""}`;
      let developerId = developerCache.get(cacheKey);

      if (developerId === undefined) {
        const developer = await findOrCreateDeveloperByResponsible({
          fullName: row.responsibleName,
          email: row.responsibleEmail,
        });
        developerId = developer?.id ?? null;
        developerCache.set(cacheKey, developerId);
        if (developerId) {
          developersLinked += 1;
          await assignDeveloperTeamIfEmpty({
            developerId,
            teamId: teamResolution.team.id,
            teamCode: teamResolution.team.code,
          });
        }
      }

      const unitTestDeliveryOn =
        row.unitTestDeliveryOn ?? row.completedOn ?? null;
      const estimateHours = toDecimalHours(row.estimateHours);
      const timeSpentHours = toDecimalHours(row.timeSpentHours);
      const rework = detectRework(row.categories);
      const delayDays =
        computeBusinessDayDelay({
          dueOn: row.dueOn,
          deliveryOn: unitTestDeliveryOn,
        }) ?? row.delayDays;

      const differenceHours =
        estimateHours != null && timeSpentHours != null
          ? Math.round((timeSpentHours - estimateHours) * 100) / 100
          : toDecimalHours(row.differenceHours);

      cardRows.push({
        import_id: importRecord.id,
        developer_id: developerId,
        jira_key: row.jiraKey,
        parent_key: row.parentKey,
        summary: row.summary,
        status: row.status,
        categories: row.categories,
        estimate_hours: estimateHours,
        time_spent_hours: timeSpentHours,
        difference_hours: differenceHours,
        delay_days: delayDays,
        started_on: row.startedOn,
        due_on: row.dueOn,
        completed_on: row.completedOn,
        unit_test_delivery_on: unitTestDeliveryOn,
        is_rework: rework.isRework,
        rework_weight: rework.reworkWeight,
        raw_payload: row.rawPayload,
      });
    }

    const inserted = await insertJiraCards(cardRows);

    const snapshotsCreated = await buildSnapshotsForImport({
      importId: importRecord.id,
      periodStart: deliveryMin,
      periodEnd: deliveryMax,
      cards: inserted,
    });

    if (snapshotsCreated === 0) {
      parseResult.warnings.push(
        "Nenhum snapshot foi gerado: nenhum card com entrega ficou vinculado a developer.",
      );
    }

    const completed = await updateImportStatus({
      importId: importRecord.id,
      status: "completed",
      recordsCount: inserted.length,
      cardsWithDeliveryCount: deliveryStats.rowsWithDelivery,
      periodStart: deliveryMin,
      periodEnd: deliveryMax,
      errorMessage: null,
      completedAt: new Date().toISOString(),
    });

    const archivedOlderCount = await archiveOlderImportsForTeam({
      teamId: teamResolution.team.id,
    });

    if (archivedOlderCount > 0) {
      parseResult.warnings.push(
        `${archivedOlderCount} import(s) anterior(es) deste time foram arquivados (mantemos as 2 mais recentes ativas).`,
      );
    }

    return {
      importRecord: completed,
      parseResult,
      insertedCount: inserted.length,
      developersLinked,
      snapshotsCreated,
      deliveryMin,
      deliveryMax,
      rowsWithDelivery: deliveryStats.rowsWithDelivery,
      team: teamResolution.team,
      jiraKeyPrefix: teamResolution.prefix,
      archivedOlderCount,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha desconhecida na importação.";

    await updateImportStatus({
      importId: importRecord.id,
      status: "failed",
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });

    throw error;
  }
}
