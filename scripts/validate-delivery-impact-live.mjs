/**
 * Live before/after impact using Jira API customfield_10053
 * (Entrega p/ Teste Unitário), compared to legacy staging/resolved proxies.
 *
 *   node --env-file=.env.local scripts/validate-delivery-impact-live.mjs
 *   DELIVERY_FIELD=customfield_10053 node --env-file=.env.local ...
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FLOW_VERSION = "flow_v1";
const PAGE = 1000;
const DEFAULT_FIELD = "customfield_10053";

function monthKey(date) {
  return date?.slice(0, 7) ?? null;
}

function toDateOnly(iso) {
  if (!iso || typeof iso !== "string" || iso.length < 10) return null;
  return iso.slice(0, 10);
}

function resolveLegacy({ flow, issue }) {
  const staging = toDateOnly(flow?.first_staging_at);
  if (staging) return { date: staging, proxy: "first_staging_at" };
  const resolved = toDateOnly(flow?.resolved_at_jira ?? issue.resolved_at_jira);
  if (resolved) return { date: resolved, proxy: "resolved_at_jira" };
  return null;
}

function resolveFixed({ flow, issue, customDate }) {
  const custom = toDateOnly(customDate);
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

async function jiraGet(base, auth, path) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  const deliveryField =
    process.env.DELIVERY_FIELD?.trim() || DEFAULT_FIELD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: integration, error } = await supabase
    .from("jira_integrations")
    .select("id, name, base_url, email, api_token_secret_ref, field_mappings")
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;

  const token = process.env[integration.api_token_secret_ref]?.trim();
  if (!token) {
    throw new Error(`Missing env ${integration.api_token_secret_ref}`);
  }
  const base = integration.base_url.replace(/\/+$/, "");
  const auth = Buffer.from(`${integration.email}:${token}`).toString("base64");

  console.log(`Integração: ${integration.name}`);
  console.log(`Campo usado nesta validação: ${deliveryField}`);
  console.log(
    `Mapeamento salvo hoje: ${integration.field_mappings?.unit_test_delivery_on ?? "(vazio)"}`,
  );

  const issues = await fetchAll(
    supabase,
    "jira_issues",
    "id, jira_key, summary, assignee_account_id, assignee_display_name, resolved_at_jira",
    [(q) => q.eq("integration_id", integration.id).order("jira_key")],
  );
  const flows = await fetchAll(
    supabase,
    "jira_issue_flow_metrics",
    "issue_id, first_staging_at, resolved_at_jira",
    [
      (q) => q.eq("integration_id", integration.id),
      (q) => q.eq("computation_version", FLOW_VERSION),
    ],
  );
  const flowByIssue = new Map(flows.map((f) => [f.issue_id, f]));

  const { data: developers } = await supabase
    .from("developers")
    .select("full_name, jira_account_id");
  const developerByAccount = new Map(
    (developers ?? [])
      .filter((d) => d.jira_account_id)
      .map((d) => [d.jira_account_id, d.full_name]),
  );

  // Pull custom field values from Jira in chunks via /search/jql
  const customByKey = new Map();
  const keys = issues.map((i) => i.jira_key);
  const chunkSize = 40;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const jql = `key in (${chunk.join(",")})`;
    const body = {
      jql,
      maxResults: chunkSize,
      fields: [deliveryField, "resolutiondate", "summary"],
    };
    const res = await fetch(`${base}/rest/api/3/search/jql`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // fallback to classic search
      const res2 = await fetch(`${base}/rest/api/3/search`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql,
          maxResults: chunkSize,
          fields: [deliveryField, "resolutiondate", "summary"],
        }),
      });
      if (!res2.ok) {
        throw new Error(`search → ${res2.status} ${await res2.text()}`);
      }
      const data2 = await res2.json();
      for (const issue of data2.issues ?? []) {
        customByKey.set(issue.key, issue.fields?.[deliveryField] ?? null);
      }
    } else {
      const data = await res.json();
      const list = data.issues ?? data.values ?? [];
      for (const issue of list) {
        customByKey.set(issue.key, issue.fields?.[deliveryField] ?? null);
      }
    }
    process.stdout.write(
      `\rJira fields: ${Math.min(i + chunkSize, keys.length)}/${keys.length}`,
    );
  }
  console.log("");

  const impacted = [];
  const switchedToCustom = [];
  const beforeMonth = new Map();
  const afterMonth = new Map();
  const beforeMonthDev = new Map();
  const afterMonthDev = new Map();
  let ap7368 = null;
  let withCustom = 0;

  for (const issue of issues) {
    const flow = flowByIssue.get(issue.id) ?? null;
    const customDate = customByKey.get(issue.jira_key) ?? null;
    if (toDateOnly(customDate)) withCustom += 1;

    const before = resolveLegacy({ flow, issue });
    const after = resolveFixed({ flow, issue, customDate });
    const developerName =
      (issue.assignee_account_id &&
        developerByAccount.get(issue.assignee_account_id)) ||
      issue.assignee_display_name ||
      "(sem assignee)";

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
      custom_field: toDateOnly(customDate),
      month_changed:
        Boolean(before && after) &&
        monthKey(before.date) !== monthKey(after.date),
      date_changed: (before?.date ?? null) !== (after?.date ?? null),
      switched_to_custom:
        after?.proxy === "jira_custom_field" &&
        before?.proxy != null &&
        before.proxy !== "jira_custom_field",
    };

    if (issue.jira_key === "AP-7368") ap7368 = row;
    if (row.date_changed || row.switched_to_custom) impacted.push(row);
    if (row.switched_to_custom) switchedToCustom.push(row);
  }

  impacted.sort((a, b) => a.jira_key.localeCompare(b.jira_key));
  const monthMoved = impacted.filter((r) => r.month_changed);

  const monthKeys = [
    ...new Set([...beforeMonth.keys(), ...afterMonth.keys()]),
  ].sort();
  const monthDelta = monthKeys.map((month) => ({
    month,
    before: beforeMonth.get(month) ?? 0,
    after: afterMonth.get(month) ?? 0,
    delta: (afterMonth.get(month) ?? 0) - (beforeMonth.get(month) ?? 0),
  }));

  const developerMonthDelta = [...new Set([...beforeMonthDev.keys(), ...afterMonthDev.keys()])]
    .map((key) => {
      const [developer, month] = key.split("|");
      const before = beforeMonthDev.get(key) ?? 0;
      const after = afterMonthDev.get(key) ?? 0;
      return { developer, month, before, after, delta: after - before };
    })
    .filter((r) => r.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Luis Arruda focus
  const luisImpacted = impacted.filter((r) =>
    /luis\s*arruda/i.test(r.developer),
  );

  const report = {
    generated_at: new Date().toISOString(),
    mode: "live_jira_custom_field",
    delivery_field: deliveryField,
    integration_id: integration.id,
    issues_total: issues.length,
    issues_with_custom_field: withCustom,
    impacted_count: impacted.length,
    month_moved_count: monthMoved.length,
    switched_to_custom_count: switchedToCustom.length,
    ap_7368: ap7368,
    month_totals: monthDelta.filter((m) => m.before || m.after),
    developer_month_deltas: developerMonthDelta,
    luis_arruda_impacted: luisImpacted,
    month_moved_cards: monthMoved,
    switched_to_custom: switchedToCustom,
    impacted_cards: impacted,
  };

  const outPath = resolve("tmp/unit-test-delivery-impact-live.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("\n=== AP-7368 (prova) ===");
  console.log(JSON.stringify(ap7368, null, 2));

  console.log(`\nIssues com ${deliveryField}: ${withCustom}/${issues.length}`);
  console.log(`Cards com data alterada: ${impacted.length}`);
  console.log(`Cards que mudam de mês: ${monthMoved.length}`);
  console.log(`Passam a jira_custom_field: ${switchedToCustom.length}`);

  console.log("\n=== Totais por mês (antes → depois) ===");
  for (const row of monthDelta) {
    if (!row.before && !row.after) continue;
    const sign = row.delta > 0 ? `+${row.delta}` : String(row.delta);
    console.log(`${row.month}: ${row.before} → ${row.after} (${sign})`);
  }

  console.log("\n=== Top variações developer × mês ===");
  for (const row of developerMonthDelta.slice(0, 30)) {
    const sign = row.delta > 0 ? `+${row.delta}` : String(row.delta);
    console.log(
      `${row.developer} · ${row.month}: ${row.before} → ${row.after} (${sign})`,
    );
  }

  console.log("\n=== Luis Arruda · cards impactados ===");
  for (const row of luisImpacted) {
    console.log(
      `${row.jira_key}: ${row.before_date}(${row.before_proxy}) → ${row.after_date}(${row.after_proxy})${row.month_changed ? " · MÊS" : ""}`,
    );
  }

  console.log(`\nRelatório: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
