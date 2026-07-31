/**
 * Compare legacy vs fixed Compilado delivery dates for a Jira integration.
 *
 * Usage:
 *   node --env-file=.env.local scripts/validate-unit-test-delivery-impact.mjs
 *
 * Optional:
 *   INTEGRATION_ID=uuid node --env-file=.env.local scripts/validate-unit-test-delivery-impact.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FLOW_VERSION = "flow_v1";
const PAGE = 1000;

function monthKey(date) {
  return date?.slice(0, 7) ?? null;
}

function toDateOnly(iso) {
  if (!iso || iso.length < 10) return null;
  return iso.slice(0, 10);
}

function resolveLegacy({ flow, issue }) {
  const staging = toDateOnly(flow?.first_staging_at);
  if (staging) return { date: staging, proxy: "first_staging_at" };
  const resolved = toDateOnly(flow?.resolved_at_jira ?? issue.resolved_at_jira);
  if (resolved) return { date: resolved, proxy: "resolved_at_jira" };
  return null;
}

function resolveFixed({ flow, issue }) {
  const custom = toDateOnly(issue.unit_test_delivery_on);
  if (custom) return { date: custom, proxy: "jira_custom_field" };
  return resolveLegacy({ flow, issue });
}

function bump(map, key, delta = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + delta);
}

async function fetchAll(supabase, table, select, filters) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    for (const apply of filters) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let integrationId = process.env.INTEGRATION_ID?.trim() || null;
  if (!integrationId) {
    const { data, error } = await supabase
      .from("jira_integrations")
      .select("id, name, field_mappings, last_successful_sync_at")
      .eq("is_enabled", true)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    if (!data?.length) throw new Error("Nenhuma integração Jira habilitada.");
    console.log("Integrações habilitadas:");
    for (const row of data) {
      console.log(
        `- ${row.id} · ${row.name} · field=${row.field_mappings?.unit_test_delivery_on ?? "(não mapeado)"} · last_sync=${row.last_successful_sync_at ?? "—"}`,
      );
    }
    integrationId = data[0].id;
    console.log(`\nUsando: ${integrationId}\n`);
  }

  const { data: integration, error: intErr } = await supabase
    .from("jira_integrations")
    .select("id, name, field_mappings")
    .eq("id", integrationId)
    .single();
  if (intErr) throw intErr;

  const mappedField = integration.field_mappings?.unit_test_delivery_on ?? null;
  console.log(`Integração: ${integration.name}`);
  console.log(`field_mappings.unit_test_delivery_on: ${mappedField ?? "(ausente)"}`);

  const issues = await fetchAll(
    supabase,
    "jira_issues",
    "id, jira_key, summary, assignee_account_id, assignee_display_name, resolved_at_jira, unit_test_delivery_on",
    [(q) => q.eq("integration_id", integrationId).order("jira_key")],
  );

  const flows = await fetchAll(
    supabase,
    "jira_issue_flow_metrics",
    "issue_id, first_staging_at, resolved_at_jira",
    [
      (q) => q.eq("integration_id", integrationId),
      (q) => q.eq("computation_version", FLOW_VERSION),
    ],
  );
  const flowByIssue = new Map(flows.map((f) => [f.issue_id, f]));

  const { data: developers, error: devErr } = await supabase
    .from("developers")
    .select("id, full_name, jira_account_id");
  if (devErr) throw devErr;
  const developerByAccount = new Map(
    (developers ?? [])
      .filter((d) => d.jira_account_id)
      .map((d) => [d.jira_account_id, d]),
  );

  const withCustom = issues.filter((i) => i.unit_test_delivery_on).length;
  console.log(`Issues: ${issues.length}`);
  console.log(`Com unit_test_delivery_on preenchido: ${withCustom}`);

  if (withCustom === 0) {
    console.log(`
⚠️  Nenhum issue tem unit_test_delivery_on populado.
    A validação antes/depois do custom field só funciona após:
    1) mapear o custom field na integração
    2) rodar sync Jira
    3) (opcional) materializar Compilado
`);
  }

  const impacted = [];
  const switchedToCustom = [];
  const beforeMonthDev = new Map();
  const afterMonthDev = new Map();
  const beforeMonth = new Map();
  const afterMonth = new Map();
  let ap7368 = null;

  for (const issue of issues) {
    const flow = flowByIssue.get(issue.id) ?? null;
    const before = resolveLegacy({ flow, issue });
    const after = resolveFixed({ flow, issue });
    const developer =
      (issue.assignee_account_id &&
        developerByAccount.get(issue.assignee_account_id)) ||
      null;
    const developerName =
      developer?.full_name ?? issue.assignee_display_name ?? "(sem assignee)";

    if (before) {
      bump(beforeMonth, monthKey(before.date));
      bump(beforeMonthDev, `${developerName}|${monthKey(before.date)}`);
    }
    if (after) {
      bump(afterMonth, monthKey(after.date));
      bump(afterMonthDev, `${developerName}|${monthKey(after.date)}`);
    }

    const row = {
      jira_key: issue.jira_key,
      summary: issue.summary,
      developer: developerName,
      before_date: before?.date ?? null,
      before_proxy: before?.proxy ?? null,
      before_month: monthKey(before?.date),
      after_date: after?.date ?? null,
      after_proxy: after?.proxy ?? null,
      after_month: monthKey(after?.date),
      custom_field: issue.unit_test_delivery_on,
      month_changed:
        Boolean(before && after) && monthKey(before.date) !== monthKey(after.date),
      date_changed: (before?.date ?? null) !== (after?.date ?? null),
      switched_to_custom:
        after?.proxy === "jira_custom_field" &&
        before?.proxy !== "jira_custom_field",
    };

    if (issue.jira_key === "AP-7368") {
      ap7368 = row;
    }
    if (row.date_changed || row.switched_to_custom) {
      impacted.push(row);
    }
    if (row.switched_to_custom) {
      switchedToCustom.push(row);
    }
  }

  impacted.sort((a, b) => a.jira_key.localeCompare(b.jira_key));
  switchedToCustom.sort((a, b) => a.jira_key.localeCompare(b.jira_key));

  const monthKeys = [
    ...new Set([...beforeMonth.keys(), ...afterMonth.keys()]),
  ].sort();
  const monthDelta = monthKeys.map((month) => ({
    month,
    before: beforeMonth.get(month) ?? 0,
    after: afterMonth.get(month) ?? 0,
    delta: (afterMonth.get(month) ?? 0) - (beforeMonth.get(month) ?? 0),
  }));

  const developerMonthKeys = [
    ...new Set([...beforeMonthDev.keys(), ...afterMonthDev.keys()]),
  ].sort();
  const developerMonthDelta = developerMonthKeys
    .map((key) => {
      const [developer, month] = key.split("|");
      const before = beforeMonthDev.get(key) ?? 0;
      const after = afterMonthDev.get(key) ?? 0;
      return {
        developer,
        month,
        before,
        after,
        delta: after - before,
      };
    })
    .filter((row) => row.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const report = {
    generated_at: new Date().toISOString(),
    integration_id: integrationId,
    integration_name: integration.name,
    mapped_field: mappedField,
    issues_total: issues.length,
    issues_with_custom_field: withCustom,
    impacted_count: impacted.length,
    switched_to_custom_count: switchedToCustom.length,
    ap_7368: ap7368,
    month_totals: monthDelta,
    developer_month_deltas: developerMonthDelta,
    impacted_cards: impacted,
    switched_to_custom: switchedToCustom,
  };

  const outPath = resolve(
    "tmp/unit-test-delivery-impact.json",
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("\n=== AP-7368 ===");
  console.log(ap7368 ?? "(não encontrado nesta integração)");

  console.log("\n=== Totais por mês (antes → depois) ===");
  for (const row of monthDelta) {
    if (row.before === 0 && row.after === 0) continue;
    const sign = row.delta > 0 ? `+${row.delta}` : String(row.delta);
    console.log(`${row.month}: ${row.before} → ${row.after} (${sign})`);
  }

  console.log("\n=== Variação developer × mês (delta ≠ 0) ===");
  for (const row of developerMonthDelta.slice(0, 40)) {
    const sign = row.delta > 0 ? `+${row.delta}` : String(row.delta);
    console.log(
      `${row.developer} · ${row.month}: ${row.before} → ${row.after} (${sign})`,
    );
  }
  if (developerMonthDelta.length > 40) {
    console.log(`… +${developerMonthDelta.length - 40} linhas`);
  }

  console.log(`\n=== Cards com data alterada: ${impacted.length} ===`);
  for (const row of impacted.slice(0, 50)) {
    console.log(
      `${row.jira_key} · ${row.developer} · ${row.before_date}(${row.before_proxy}) → ${row.after_date}(${row.after_proxy})${row.month_changed ? " · MÊS MUDOU" : ""}`,
    );
  }
  if (impacted.length > 50) {
    console.log(`… +${impacted.length - 50} cards`);
  }

  console.log(
    `\n=== Passaram a usar jira_custom_field: ${switchedToCustom.length} ===`,
  );
  console.log(`\nRelatório completo: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
