/**
 * Read-only diagnosis for Luis Arruda Gestor count and AP delivery mapping.
 *
 * Usage:
 *   node --env-file=.env.local scripts/diagnose-luis-gestor-count.mjs
 */

import { createClient } from "@supabase/supabase-js";

const JULY_START = "2026-07-01";
const JULY_END = "2026-07-31";
const DIVERGENT_KEYS = [
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
];

function capturedAt(batch) {
  return batch.completed_at ?? batch.updated_at ?? batch.created_at ?? "";
}

function overlapsJuly(batch) {
  return (
    batch.period_start &&
    batch.period_end &&
    batch.period_start <= JULY_END &&
    batch.period_end >= JULY_START
  );
}

function mappingField(raw, key) {
  if (!raw || typeof raw !== "object") return null;
  const mappings = raw.field_mapping_resolution;
  if (!mappings || typeof mappings !== "object") return null;
  return mappings.fields?.[key] ?? null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env ausente.");

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: integrations, error: integrationError } = await supabase
    .from("jira_integrations")
    .select(
      "id, team_id, name, field_mappings, last_successful_sync_at, updated_at",
    )
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false });
  if (integrationError) throw integrationError;
  const integration = integrations?.[0];
  if (!integration) throw new Error("Integração Jira habilitada não encontrada.");

  const { data: project, error: projectError } = await supabase
    .from("jira_projects")
    .select("id, key, name, field_mappings, updated_at")
    .eq("integration_id", integration.id)
    .eq("key", "AP")
    .maybeSingle();
  if (projectError) throw projectError;

  const { data: luisRows, error: luisError } = await supabase
    .from("developers")
    .select("id, full_name, jira_account_id")
    .ilike("full_name", "%Luis%Arruda%");
  if (luisError) throw luisError;
  const luis = luisRows?.[0] ?? null;
  if (!luis) throw new Error("Developer Luis Arruda não encontrado.");

  const { data: imports, error: importsError } = await supabase
    .from("imports")
    .select(
      "id, team_id, source, source_label, status, period_start, period_end, records_count, cards_with_delivery_count, completed_at, created_at, updated_at, archived_at",
    )
    .eq("status", "completed")
    .is("archived_at", null)
    .or(`team_id.eq.${integration.team_id},team_id.is.null`)
    .order("completed_at", { ascending: false });
  if (importsError) throw importsError;

  const eligible = (imports ?? [])
    .filter((batch) => batch.source === "jira" || batch.source === "spreadsheet")
    .sort((a, b) => capturedAt(b).localeCompare(capturedAt(a)));
  const overlapping = eligible.filter(overlapsJuly);
  const selectedAuto = overlapping[0] ?? eligible[0] ?? null;
  const selectedJira =
    overlapping.find((batch) => batch.source === "jira") ??
    eligible.find((batch) => batch.source === "jira") ??
    null;

  const batchIds = [
    ...new Set(
      [selectedAuto?.id, selectedJira?.id].filter(
        (value) => typeof value === "string",
      ),
    ),
  ];

  const cardsByBatch = {};
  for (const batchId of batchIds) {
    const { data, error } = await supabase
      .from("jira_cards")
      .select(
        "id, import_id, developer_id, jira_key, unit_test_delivery_on, started_on, due_on, completed_on, delay_days, raw_payload",
      )
      .eq("import_id", batchId)
      .eq("developer_id", luis.id)
      .gte("unit_test_delivery_on", JULY_START)
      .lte("unit_test_delivery_on", JULY_END)
      .order("jira_key");
    if (error) throw error;
    cardsByBatch[batchId] = data ?? [];
  }

  const { data: canonicalIssues, error: issueError } = await supabase
    .from("jira_issues")
    .select(
      "id, project_id, jira_key, assignee_account_id, assignee_display_name, unit_test_delivery_on, resolved_at_jira, updated_at_jira, raw_payload, last_synced_at",
    )
    .eq("integration_id", integration.id)
    .in("jira_key", [...DIVERGENT_KEYS, "AP-7516"])
    .order("jira_key");
  if (issueError) throw issueError;

  const importIds = (imports ?? []).map((batch) => batch.id);
  const { data: materializedCards, error: cardsError } = await supabase
    .from("jira_cards")
    .select(
      "import_id, developer_id, jira_key, unit_test_delivery_on, completed_on, raw_payload",
    )
    .in("jira_key", [...DIVERGENT_KEYS, "AP-7516"])
    .in("import_id", importIds.length ? importIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });
  if (cardsError) throw cardsError;

  const importById = new Map((imports ?? []).map((batch) => [batch.id, batch]));
  const canonicalByKey = new Map(
    (canonicalIssues ?? []).map((issue) => [issue.jira_key, issue]),
  );
  const latestMaterializedByKey = new Map();
  for (const card of materializedCards ?? []) {
    const batch = importById.get(card.import_id);
    const current = latestMaterializedByKey.get(card.jira_key);
    if (
      !current ||
      capturedAt(batch ?? {}).localeCompare(
        capturedAt(importById.get(current.import_id) ?? {}),
      ) > 0
    ) {
      latestMaterializedByKey.set(card.jira_key, card);
    }
  }

  console.log("\n=== Integração / mapping AP ===");
  console.log({
    integration_id: integration.id,
    team_id: integration.team_id,
    last_successful_sync_at: integration.last_successful_sync_at,
    integration_default: integration.field_mappings,
    project: project
      ? {
          id: project.id,
          key: project.key,
          name: project.name,
          field_mappings: project.field_mappings,
          updated_at: project.updated_at,
        }
      : null,
    effective_unit_test_delivery_on:
      project?.field_mappings?.unit_test_delivery_on ??
      integration.field_mappings?.unit_test_delivery_on ??
      null,
    effective_source: project?.field_mappings?.unit_test_delivery_on
      ? "project"
      : integration.field_mappings?.unit_test_delivery_on
        ? "integration"
        : "none/proxy",
  });

  console.log("\n=== Snapshot que o Gestor resolveria para julho/2026 ===");
  console.log({
    auto: selectedAuto,
    jira_mode: selectedJira,
    latest_candidates: overlapping.slice(0, 5).map((batch) => ({
      id: batch.id,
      source: batch.source,
      label: batch.source_label,
      captured_at: capturedAt(batch),
      period: `${batch.period_start}..${batch.period_end}`,
      records: batch.records_count,
    })),
  });

  for (const batch of [selectedAuto, selectedJira]) {
    if (!batch || !cardsByBatch[batch.id]) continue;
    const cards = cardsByBatch[batch.id];
    console.log(`\n=== Luis em julho · ${batch.source} · ${batch.id} ===`);
    console.log({
      count: cards.length,
      captured_at: capturedAt(batch),
      source_label: batch.source_label,
      keys: cards.map((card) => card.jira_key),
    });
  }

  console.log("\n=== AP-7368 ponta a ponta ===");
  const canonical7368 = canonicalByKey.get("AP-7368") ?? null;
  const materialized7368 = latestMaterializedByKey.get("AP-7368") ?? null;
  console.log({
    canonical: canonical7368
      ? {
          unit_test_delivery_on: canonical7368.unit_test_delivery_on,
          resolved_at_jira: canonical7368.resolved_at_jira,
          updated_at_jira: canonical7368.updated_at_jira,
          last_synced_at: canonical7368.last_synced_at,
          mapping_resolution: canonical7368.raw_payload?.field_mapping_resolution,
        }
      : null,
    latest_materialized: materialized7368
      ? {
          import_id: materialized7368.import_id,
          batch_captured_at: capturedAt(
            importById.get(materialized7368.import_id) ?? {},
          ),
          unit_test_delivery_on: materialized7368.unit_test_delivery_on,
          completed_on: materialized7368.completed_on,
          bridge_proxy:
            materialized7368.raw_payload?.proxies?.unit_test_delivery_on ?? null,
        }
      : null,
  });

  console.log("\n=== Chaves divergentes · canônico vs último materializado ===");
  for (const jiraKey of [...DIVERGENT_KEYS, "AP-7516"]) {
    const issue = canonicalByKey.get(jiraKey);
    const card = latestMaterializedByKey.get(jiraKey);
    console.log({
      jira_key: jiraKey,
      canonical_delivery: issue?.unit_test_delivery_on ?? null,
      canonical_mapping:
        mappingField(issue?.raw_payload, "unit_test_delivery_on") ?? null,
      canonical_last_synced_at: issue?.last_synced_at ?? null,
      materialized_delivery: card?.unit_test_delivery_on ?? null,
      materialized_import_id: card?.import_id ?? null,
      materialized_batch_at: card
        ? capturedAt(importById.get(card.import_id) ?? {})
        : null,
      materialized_proxy:
        card?.raw_payload?.proxies?.unit_test_delivery_on ?? null,
      in_selected_auto_july: Boolean(
        selectedAuto &&
          cardsByBatch[selectedAuto.id]?.some(
            (selected) => selected.jira_key === jiraKey,
          ),
      ),
      in_selected_jira_july: Boolean(
        selectedJira &&
          cardsByBatch[selectedJira.id]?.some(
            (selected) => selected.jira_key === jiraKey,
          ),
      ),
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
